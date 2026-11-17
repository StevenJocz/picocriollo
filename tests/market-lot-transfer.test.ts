import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmData } from '../src/models/farm.ts';
import { createListing } from '../src/features/market/service/listings.ts';
import { activeLocks } from '../src/features/market/service/locks.ts';
import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const chick = { id: 'ch1', code: 'POL-0001-AAAA1111', birthId: 'bi1', sourceLotIds: [], incubationId: 'i1', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: '' };
const eggs = { id: 'fe1', code: 'FER-0001-BBBB2222', sourceCollectionId: 'e1', productType: 'Huevo fértil', date: '2026-10-01', coopId: 'c', breed: 'Criolla', initial: 30, available: 30, sold: 0, incubated: 0, discarded: 0, fertility: 'Confirmada', storageNotes: '', notes: '' };

async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { birds: [bird({ id: 'b1', name: 'Uno' }), bird({ id: 'b2', name: 'Dos' })], chickLots: [chick], fertileLots: [eggs] });
  return { ana, beto };
}
async function toDelivered(env: TestEnv, ana: string, beto: string, input: Record<string, unknown>) {
  const listing = await createListing(deps(env), ctx(env, ana), { kind: 'fixed', price: 120000, publish: true, ...input } as never);
  const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
  await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
  await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
  await confirmPayment(env.store, ctx(env, ana), op.id);
  await markDelivered(env.store, ctx(env, ana), op.id);
  return { listing, op };
}

test('lote de pollitos: descuenta al vendedor y crea un lote nuevo en la granja del comprador', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { listing, op } = await toDelivered(env, ana, beto, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    const done = await confirmReceipt(env.store, ctx(env, beto), op.id);
    assert.match(done.receiptCode, /^TRF-/);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(seller.chickLots[0].available, 12); assert.equal(seller.chickLots[0].sold, 8);
    assert.equal(seller.lotMovements[0].kind, 'Vendido'); assert.equal(seller.lotMovements[0].referenceId, op.id);
    assert.equal(buyer.chickLots.length, 1);
    assert.equal(buyer.chickLots[0].available, 8); assert.equal(buyer.chickLots[0].initial, 8); assert.equal(buyer.chickLots[0].coopId, '');
    assert.match(buyer.chickLots[0].code, /^POL-\d{4}-[A-Z0-9]{8}$/);
    assert.notEqual(buyer.chickLots[0].code, seller.chickLots[0].code);
    await env.store.tx(async tx => {
      assert.equal((await tx.listings.get(listing.id))!.status, 'vendida');
      assert.equal((await activeLocks(tx, listing.id)).length, 0);
    });
    await env.saveFarm(ana, { chickLots: [{ ...seller.chickLots[0], available: 2 }] }); // ya no hay reserva
  } finally { await env.cleanup(); }
});

test('lote de huevos conserva la fertilidad declarada y se descuenta', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await toDelivered(env, ana, beto, { itemType: 'lote_huevos', lotId: 'fe1', quantity: 12 });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(seller.fertileLots[0].available, 18);
    assert.equal(buyer.fertileLots[0].available, 12); assert.equal(buyer.fertileLots[0].fertility, 'Confirmada'); assert.equal(buyer.fertileLots[0].productType, 'Huevo fértil');
  } finally { await env.cleanup(); }
});

test('lote de aves: transfiere todas las aves; si una falla no se mueve ninguna', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { listing, op } = await toDelivered(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    const other = await env.addUser('Carla');
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: other }); });
    await assert.rejects(confirmReceipt(env.store, ctx(env, beto), op.id), status(409));
    assert.equal(((await env.farm(beto)) as unknown as FarmData).birds.length, 0);
    await env.store.tx(async tx => { assert.notEqual((await tx.operations.get(op.id))!.status, 'completada'); assert.equal((await tx.listings.get(listing.id))!.status, 'en_operacion'); });
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: ana }); });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.deepEqual(buyer.birds.map(b => b.id).sort(), ['b1', 'b2']);
    assert.ok(seller.birds.every(b => b.status === 'Transferido'));
    await env.store.tx(async tx => { assert.equal((await tx.ownership.get('b1'))!.ownerId, beto); assert.equal((await tx.ownership.get('b2'))!.ownerId, beto); });
  } finally { await env.cleanup(); }
});

test('cancelar una operación de lote libera la reserva y deja la publicación disponible', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const listing = await createListing(deps(env), ctx(env, ana), { kind: 'fixed', price: 90000, publish: true, itemType: 'lote_aves', birdIds: ['b1', 'b2'] } as never);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    await cancelOperation(env.store, ctx(env, ana), op.id, 'No hubo acuerdo de entrega');
    await env.store.tx(async tx => {
      const locks = await activeLocks(tx, listing.id);
      assert.equal(locks.length, 2); assert.ok(locks.every(l => l.operationId === undefined));
      assert.equal((await tx.listings.get(listing.id))!.status, 'publicada');
    });
  } finally { await env.cleanup(); }
});
