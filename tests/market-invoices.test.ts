import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing } from '../src/features/market/service/listings.ts';
import { getInvoice, listInvoices, verifyInvoice } from '../src/features/market/service/invoices.ts';
import { confirmPayment, confirmReceipt, declarePayment, listOperations, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, notes, status } from './helpers/market.ts';

async function sale(env: TestEnv, seller: string, buyer: string, input: Record<string, unknown>, price = 150000) {
  const listing = await createListing(deps(env), ctx(env, seller), { kind: 'fixed', price, publish: true, ...input } as never);
  const op = await requestPurchase(env.store, ctx(env, buyer), listing.id);
  await respondPurchase(env.store, ctx(env, seller), op.id, 'accept');
  await declarePayment(env.store, ctx(env, buyer), op.id, 'Nequi');
  await confirmPayment(env.store, ctx(env, seller), op.id);
  await markDelivered(env.store, ctx(env, seller), op.id);
  return { listing, op };
}
async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
  await env.saveFarm(ana, {
    birds: [bird({ id: 'b1', name: 'Uno', code: 'AVE-1' }), bird({ id: 'b2', name: 'Dos', code: 'AVE-2' })],
    chickLots: [{ id: 'ch1', code: 'POL-0001-AAAA1111', birthId: '', sourceLotIds: [], incubationId: '', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: '' }],
  });
  return { ana, beto, carla };
}

test('la factura se emite solo al completar la venta, una por operación, y ambas partes la ven', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'ave', birdId: 'b1' });
    assert.equal((await listInvoices(env.store, beto)).length, 0); // aún no recibida
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const bought = await listInvoices(env.store, beto), sold = await listInvoices(env.store, ana);
    assert.equal(bought.length, 1); assert.equal(sold.length, 1);
    assert.match(bought[0].number, /^FAC-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(bought[0].role, 'comprador'); assert.equal(sold[0].role, 'vendedor');
    assert.equal(bought[0].total, 150000); assert.equal(bought[0].counterpart, 'Ana');
    assert.equal((await listInvoices(env.store, ana, 'comprador')).length, 0);
    assert.equal((await listOperations(env.store, beto)).find(item => item.id === op.id)?.invoiceNumber, bought[0].number);
    const view = await getInvoice(env.store, beto, bought[0].number);
    assert.equal(view.integrity, true); assert.equal(view.paymentMethod, 'Nequi');
    assert.equal(view.lines.length, 1); assert.equal(view.lines[0].total, 150000); assert.equal(view.lines[0].unit, 'ave');
    assert.ok(!JSON.stringify(view).includes('@correo.test')); assert.ok(!JSON.stringify(view).includes('secreto-hash'));
    assert.equal((await notes(env, ana, 'market.invoice.issued')).length, 1);
    assert.equal((await notes(env, beto, 'market.invoice.issued')).length, 1);
  } finally { await env.cleanup(); }
});

test('contenido de la factura por tipo de publicación', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const lote = await sale(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }, 200000);
    await confirmReceipt(env.store, ctx(env, beto), lote.op.id);
    const pollitos = await sale(env, ana, beto, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 }, 96000);
    await confirmReceipt(env.store, ctx(env, beto), pollitos.op.id);
    const list = await listInvoices(env.store, ana);
    const a = await getInvoice(env.store, ana, list.find(i => i.total === 200000)!.number);
    assert.equal(a.lines[0].unit, 'lote'); assert.equal(a.lines[0].itemType, 'lote_aves'); assert.deepEqual(a.lines[0].detail, ['Uno · AVE-1', 'Dos · AVE-2']);
    const p = await getInvoice(env.store, ana, list.find(i => i.total === 96000)!.number);
    assert.equal(p.lines[0].description, 'Lote de 8 pollitos Brahma'); assert.deepEqual(p.lines[0].detail, ['8 pollitos Brahma']);
  } finally { await env.cleanup(); }
});

test('un tercero no ve facturas ajenas; número inexistente da 404; la huella detecta alteraciones', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, carla } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'ave', birdId: 'b1' });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const number = (await listInvoices(env.store, ana))[0].number;
    await assert.rejects(getInvoice(env.store, carla, number), status(403));
    assert.equal((await listInvoices(env.store, carla)).length, 0);
    await assert.rejects(getInvoice(env.store, ana, 'FAC-00000000-XXXXXX'), status(404));
    const record = await env.store.tx(async tx => (await tx.invoices.list({ number }))[0]);
    assert.equal(verifyInvoice(record), true);
    assert.equal(verifyInvoice({ ...record, total: record.total + 1 }), false);
    assert.equal(verifyInvoice({ ...record, lines: [{ ...record.lines[0], description: 'Otra cosa' }] }), false);
  } finally { await env.cleanup(); }
});

test('si la transferencia falla no queda factura', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: 'otro' }); });
    await assert.rejects(confirmReceipt(env.store, ctx(env, beto), op.id), status(409));
    await env.store.tx(async tx => assert.equal((await tx.invoices.list()).length, 0));
  } finally { await env.cleanup(); }
});
