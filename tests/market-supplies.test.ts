import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmData } from '../src/models/farm.ts';
import { createListing } from '../src/features/market/service/listings.ts';
import { confirmPayment, confirmReceipt, declarePayment, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const maize = { id: 'cp1', code: 'PRO-0001-AAAA1111', name: 'Maíz triturado', category: 'Alimento', unit: 'kg', price: 2400, available: 100 };

async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { customProducts: [maize] });
  return { ana, beto };
}

const publish = (env: TestEnv, sellerId: string, quantity: number, extra: Record<string, unknown> = {}) =>
  createListing(deps(env), ctx(env, sellerId), { itemType: 'insumo', lotId: 'cp1', quantity, kind: 'fixed', price: 2400 * quantity, publish: true, consent: { description: 'Maíz limpio y seco', deliveryZone: 'Rionegro' }, ...extra } as never);

test('un insumo (maíz, cuido, equipos) se publica con su cantidad y unidad', async () => {
  const env = await makeEnv();
  try {
    const { ana } = await world(env);
    const listing = await publish(env, ana, 40);
    assert.equal(listing.itemType, 'insumo');
    assert.equal(listing.status, 'publicada');
    assert.equal(listing.snapshot.title, 'Maíz triturado · 40 kg');
    assert.equal(listing.snapshot.itemType, 'insumo');
    assert.equal(listing.snapshot.quantity, 40);
    assert.equal(listing.snapshot.breed, 'Alimento');
    assert.equal(listing.snapshot.code, maize.code);
  } finally { await env.cleanup(); }
});

test('no se puede publicar más de lo disponible ni dejar menos de lo reservado en el mercado', async () => {
  const env = await makeEnv();
  try {
    const { ana } = await world(env);
    await publish(env, ana, 70);
    await assert.rejects(publish(env, ana, 40), status(409), 'solo quedan 30 unidades libres');
    await assert.rejects(env.saveFarm(ana, { customProducts: [{ ...maize, available: 50 }] }), status(409));
    await assert.rejects(env.saveFarm(ana, { customProducts: [] }), status(409));
    await env.saveFarm(ana, { customProducts: [{ ...maize, available: 80 }] });
    await assert.rejects(publish(env, ana, 0), status(400));
  } finally { await env.cleanup(); }
});

test('al completar la venta se descuenta al vendedor y el comprador recibe el insumo en su granja', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const listing = await publish(env, ana, 40);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
    await confirmPayment(env.store, ctx(env, ana), op.id);
    await markDelivered(env.store, ctx(env, ana), op.id);
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(seller.customProducts[0].available, 60);
    assert.equal(buyer.customProducts.length, 1);
    assert.equal(buyer.customProducts[0].name, 'Maíz triturado');
    assert.equal(buyer.customProducts[0].unit, 'kg');
    assert.equal(buyer.customProducts[0].available, 40);
    assert.notEqual(buyer.customProducts[0].id, 'cp1', 'el comprador recibe un registro propio');
    await env.store.tx(async tx => {
      assert.equal((await tx.listings.get(listing.id))!.status, 'vendida');
      const invoices = await tx.invoices.list();
      assert.equal(invoices.length, 1);
      assert.match(invoices[0].lines[0].detail[0], /40 kg/);
    });
  } finally { await env.cleanup(); }
});

test('una segunda compra del mismo insumo suma al registro que el comprador ya tiene', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    for (const quantity of [10, 15]) {
      const listing = await publish(env, ana, quantity);
      const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
      await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
      await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
      await confirmPayment(env.store, ctx(env, ana), op.id);
      await markDelivered(env.store, ctx(env, ana), op.id);
      await confirmReceipt(env.store, ctx(env, beto), op.id);
    }
    const buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(buyer.customProducts.length, 1);
    assert.equal(buyer.customProducts[0].available, 25);
  } finally { await env.cleanup(); }
});
