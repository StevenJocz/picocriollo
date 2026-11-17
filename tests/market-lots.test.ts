import assert from 'node:assert/strict';
import test from 'node:test';
import { browseListings, createListing, myListings, withdrawListing } from '../src/features/market/service/listings.ts';
import { activeLocks } from '../src/features/market/service/locks.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const lotFarm = {
  birds: [bird({ id: 'b1', name: 'Uno', code: 'AVE-1' }), bird({ id: 'b2', name: 'Dos', code: 'AVE-2', sex: 'Gallo' }), bird({ id: 'b3', name: 'Tres', code: 'AVE-3' })],
  births: [{ id: 'bi1', incubationId: 'i1', date: '2026-09-01', count: 20, motherId: '', fatherId: '', coopId: 'c', breed: 'Brahma', notes: '' }],
  chickLots: [{ id: 'ch1', code: 'POL-0001-AAAA1111', birthId: 'bi1', sourceLotIds: [], incubationId: 'i1', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: 'NOTA-PRIVADA-NO-PUBLICAR' }],
  fertileLots: [{ id: 'fe1', code: 'FER-0001-BBBB2222', sourceCollectionId: 'e1', productType: 'Huevo fértil', date: '2026-10-01', coopId: 'c', breed: 'Criolla', initial: 30, available: 30, sold: 0, incubated: 0, discarded: 0, fertility: 'Pendiente', storageNotes: '', notes: 'NOTA-PRIVADA-NO-PUBLICAR' }],
};
async function seller(env: TestEnv) { const ana = await env.addUser('Ana'); await env.saveFarm(ana, lotFarm); return ana; }
const create = (env: TestEnv, userId: string, input: Record<string, unknown>) => createListing(deps(env), ctx(env, userId), { kind: 'fixed', price: 100000, publish: true, ...input } as never);

test('lote de aves: publica 2+ aves con un bloqueo por ave y vista pública sin datos privados', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    assert.equal(listing.status, 'publicada');
    assert.equal(listing.snapshot.itemType, 'lote_aves');
    assert.equal(listing.snapshot.quantity, 2);
    assert.equal(listing.snapshot.title, 'Lote de 2 aves Criolla');
    assert.equal(listing.snapshot.sex, 'Mixto');
    assert.deepEqual(listing.snapshot.lotBirds?.map(b => b.name), ['Uno', 'Dos']);
    assert.ok(!JSON.stringify(listing.snapshot).includes('NOTA-PRIVADA'));
    await env.store.tx(async tx => assert.equal((await activeLocks(tx, listing.id)).length, 2));
  } finally { await env.cleanup(); }
});

test('lote de aves: rechaza menos de 2, repetidas, ajenas y más de 50; un ave inválida no deja bloqueos', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1'] }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b1'] }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: Array.from({ length: 51 }, (_, i) => `x${i}`) }), status(400));
    await assert.rejects(create(env, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }), status(403));
    await env.saveFarm(ana, { birds: [...lotFarm.birds.slice(0, 2), bird({ id: 'b3', name: 'Tres', status: 'Vendido' })] });
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b3'] }), status(409));
    await env.store.tx(async tx => assert.equal((await tx.locks.list({ status: 'active' })).length, 0));
    await create(env, ana, { itemType: 'ave', birdId: 'b1' });
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }), status(409));
  } finally { await env.cleanup(); }
});

test('lote de pollitos: valida cantidad y no permite que dos publicaciones superen lo disponible', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    for (const quantity of [0, -1, 1.5, '3', undefined]) await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 21 }), status(409));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'nada', quantity: 1 }), status(403));
    const first = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    assert.equal(first.snapshot.title, 'Lote de 8 pollitos Brahma');
    assert.equal(first.snapshot.quantity, 8);
    assert.equal(first.snapshot.code, 'POL-0001-AAAA1111');
    assert.match(first.snapshot.ageLabel, /días|día/);
    assert.ok(!JSON.stringify(first.snapshot).includes('NOTA-PRIVADA'));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 13 }), status(409));
    const second = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 12 });
    assert.equal(second.status, 'publicada');
    await withdrawListing(deps(env), ctx(env, ana), first.id);
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
  } finally { await env.cleanup(); }
});

test('lote de huevos: publica la fertilidad tal como está declarada', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_huevos', lotId: 'fe1', quantity: 12 });
    assert.equal(listing.snapshot.title, 'Lote de 12 huevos fértiles Criolla');
    assert.equal(listing.snapshot.fertility, 'Pendiente');
    assert.equal(listing.snapshot.declaredBySeller, true);
  } finally { await env.cleanup(); }
});

test('guardar la granja no puede dejar un lote con menos disponible que lo reservado ni borrarlo', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    await assert.rejects(env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], available: 7 }] }), status(409));
    await assert.rejects(env.saveFarm(ana, { chickLots: [] }), status(409));
    await env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], available: 8 }] });
  } finally { await env.cleanup(); }
});

test('si cambia la ficha de origen de un lote la publicación pide revisión sin modificarse', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    await env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], breed: 'Cubana' }] });
    const mine = (await myListings(env.store, ana)).find(row => row.id === listing.id)!;
    assert.equal(mine.needsReview, true);
    assert.equal(mine.snapshot.breed, 'Brahma');
  } finally { await env.cleanup(); }
});

test('el catálogo filtra por tipo y las publicaciones antiguas cuentan como «ave»', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    await create(env, ana, { itemType: 'ave', birdId: 'b1' });
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 5 });
    assert.equal((await browseListings(env.store, {})).total, 2);
    assert.equal((await browseListings(env.store, { type: 'lote_pollitos' })).total, 1);
    assert.equal((await browseListings(env.store, { type: 'ave' })).total, 1);
    await env.store.tx(async tx => { const row = (await tx.listings.list({ sellerId: ana })).find(l => l.itemType === 'ave')!; const legacy = { ...row }; delete legacy.itemType; delete legacy.items; await tx.listings.update(legacy); });
    assert.equal((await browseListings(env.store, { type: 'ave' })).total, 1);
  } finally { await env.cleanup(); }
});
