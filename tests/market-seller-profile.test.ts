import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing } from '../src/features/market/service/listings.ts';
import { confirmPayment, confirmReceipt, declarePayment, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { getSellerProfile } from '../src/features/market/service/seller-profile.ts';
import { RATING_WINDOW_MS, rateOperation } from '../src/features/market/service/trust.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

async function sold(env: TestEnv, seller: string, buyer: string, birdId: string, price: number) {
  const listing = await createListing(deps(env), ctx(env, seller), { birdId, kind: 'fixed', price, publish: true });
  const op = await requestPurchase(env.store, ctx(env, buyer), listing.id);
  await respondPurchase(env.store, ctx(env, seller), op.id, 'accept');
  await declarePayment(env.store, ctx(env, buyer), op.id, 'Efectivo'); await confirmPayment(env.store, ctx(env, seller), op.id);
  await markDelivered(env.store, ctx(env, seller), op.id); await confirmReceipt(env.store, ctx(env, buyer), op.id);
  return op;
}
async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { birds: ['a', 'b', 'c'].map(id => bird({ id, name: id.toUpperCase(), code: `AVE-${id}`, notes: 'NOTA-PRIVADA-NO-PUBLICAR' })) });
  return { ana, beto };
}

test('vendedor sin ventas: perfil en ceros, sin dividir por cero', async () => {
  const env = await makeEnv();
  try {
    const { ana } = await world(env);
    const profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.alias, 'Ana');
    assert.deepEqual(profile.reputation, { count: 0, average: 0, distribution: [0, 0, 0, 0, 0], completedSales: 0 });
    assert.deepEqual(profile.active, []); assert.deepEqual(profile.sold, []); assert.deepEqual(profile.reviews, []);
    await assert.rejects(getSellerProfile(env.store, 'no-existe', env.now), status(404));
  } finally { await env.cleanup(); }
});

test('el perfil muestra activas, vendidas sin precio ni comprador, y no filtra datos privados', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    await sold(env, ana, beto, 'a', 91111);
    await createListing(deps(env), ctx(env, ana), { birdId: 'b', kind: 'fixed', price: 70000, publish: true });
    const profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reputation.completedSales, 1);
    assert.equal(profile.active.length, 1); assert.equal(profile.active[0].sellerId, ana);
    assert.equal(profile.sold.length, 1); assert.equal(profile.sold[0].title, 'A');
    const json = JSON.stringify(profile.sold);
    for (const secret of ['91111', 'Beto', '@correo.test', 'NOTA-PRIVADA-NO-PUBLICAR', 'secreto-hash']) assert.ok(!json.includes(secret), `no debe filtrar ${secret} en vendidas`);
    const all = JSON.stringify(profile);
    for (const secret of ['Beto', '@correo.test', 'NOTA-PRIVADA-NO-PUBLICAR', 'secreto-hash']) assert.ok(!all.includes(secret), `no debe filtrar ${secret}`);
  } finally { await env.cleanup(); }
});

test('una opinión es pública cuando ambas partes valoraron o venció el plazo; la reputación es solo como vendedor', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const op = await sold(env, ana, beto, 'a', 80000);
    await rateOperation(env.store, ctx(env, beto), op.id, { stars: 5, comment: 'Excelente trato' });
    let profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reviews.length, 0); // la otra parte aún no valoró
    assert.equal(profile.reputation.count, 1); assert.equal(profile.reputation.average, 5); assert.deepEqual(profile.reputation.distribution, [0, 0, 0, 0, 1]);
    await rateOperation(env.store, ctx(env, ana), op.id, { stars: 4, comment: 'Buen comprador' });
    profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reviews.length, 1);
    assert.deepEqual({ stars: profile.reviews[0].stars, comment: profile.reviews[0].comment, raterAlias: profile.reviews[0].raterAlias }, { stars: 5, comment: 'Excelente trato', raterAlias: 'Beto' });
    const asBuyer = await getSellerProfile(env.store, beto, env.now);
    assert.equal(asBuyer.reputation.count, 0); // la valoración de Ana a Beto no cuenta como vendedor
    const later = new Date(env.now.getTime() + RATING_WINDOW_MS + 1000);
    const op2 = await sold(env, ana, beto, 'b', 60000);
    await rateOperation(env.store, ctx(env, beto, env.now), op2.id, { stars: 3, comment: 'Regular' });
    assert.equal((await getSellerProfile(env.store, ana, env.now)).reviews.length, 1);
    assert.equal((await getSellerProfile(env.store, ana, later)).reviews.length, 2);
  } finally { await env.cleanup(); }
});

test('vendedor suspendido sigue visible pero sin publicaciones activas; las reseñas se paginan de 20 en 20', async () => {
  const env = await makeEnv();
  try {
    const { ana } = await world(env);
    await createListing(deps(env), ctx(env, ana), { birdId: 'c', kind: 'fixed', price: 50000, publish: true });
    await env.store.tx(async tx => { const user = (await tx.users.get(ana))!; await tx.users.update({ ...user, suspendedAt: env.now.toISOString(), suspendedReason: 'prueba' }); });
    assert.deepEqual((await getSellerProfile(env.store, ana, env.now)).active, []);
    const page = await getSellerProfile(env.store, ana, env.now, { reviewsOffset: 20 });
    assert.equal(page.reviewsTotal, 0); assert.deepEqual(page.reviews, []);
  } finally { await env.cleanup(); }
});
