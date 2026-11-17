import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing, getListingForViewer, updateListing } from '../src/features/market/service/listings.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, sellerWithBird, status } from './helpers/market.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG = (n: number) => `data:image/jpeg;base64,${Buffer.alloc(n, 1).toString('base64')}`;
const make = (env: Awaited<ReturnType<typeof makeEnv>>, userId: string, photos: unknown) => createListing(deps(env), ctx(env, userId), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true, photos } as never);

test('guarda hasta 6 fotos en orden, la primera es la portada y photoId la apunta', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    const listing = await make(env, ana, [PNG, JPG(500), PNG]);
    assert.equal(listing.snapshot.photoIds?.length, 3);
    assert.equal(listing.snapshot.photoId, listing.snapshot.photoIds![0]);
    const view = await getListingForViewer(env.store, listing.id);
    assert.equal(view.listing.snapshot.photoUrls?.length, 3);
    assert.equal(view.listing.snapshot.photoUrl, view.listing.snapshot.photoUrls![0]);
    assert.equal((await env.media.get(listing.snapshot.photoIds![1]))?.mime, 'image/jpeg');
  } finally { await env.cleanup(); }
});

test('rechaza fotos inválidas: más de 6, tipo no permitido, base64 corrupto, >3 MB y total >12 MB', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    await assert.rejects(make(env, ana, Array(7).fill(PNG)), status(400));
    await assert.rejects(make(env, ana, ['data:image/gif;base64,R0lGODlhAQABAAAAACw=']), status(400));
    await assert.rejects(make(env, ana, ['data:image/png;base64,@@@@']), status(400));
    await assert.rejects(make(env, ana, ['no-es-una-foto']), status(400));
    await assert.rejects(make(env, ana, [JPG(3 * 1024 * 1024 + 1)]), status(400));
    await assert.rejects(make(env, ana, Array(5).fill(JPG(2.9 * 1024 * 1024))), status(400));
    await assert.rejects(make(env, ana, 'una sola'), status(400));
    await env.store.tx(async tx => assert.equal((await tx.listings.list()).length, 0));
  } finally { await env.cleanup(); }
});

test('sin fotos subidas se usa la foto del ave; editar fotos las reemplaza y vaciar vuelve a la del ave', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [{ id: 'luna', code: 'AVE-3', name: 'Luna', sex: 'Gallina', breed: 'Criolla', coopId: 'c', status: 'Activo', bornAt: '2025-06-01', origin: '', motherId: '', fatherId: '', photo: PNG, notes: '' }] });
    const listing = await make(env, ana, undefined);
    assert.equal(listing.snapshot.photoIds?.length, 1);
    const edited = await updateListing(deps(env), ctx(env, ana), listing.id, { photos: [PNG, PNG] });
    assert.equal(edited.snapshot.photoIds?.length, 2);
    assert.notEqual(edited.snapshot.photoIds![0], listing.snapshot.photoIds![0]);
    const cleared = await updateListing(deps(env), ctx(env, ana), listing.id, { photos: [] });
    assert.equal(cleared.snapshot.photoIds?.length, 1);
  } finally { await env.cleanup(); }
});

test('fitSize reduce al lado mayor sin ampliar ni dejar lados en cero', async () => {
  const { fitSize } = await import('../src/features/market/service/photo-size.ts');
  assert.deepEqual(fitSize(4000, 2000, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitSize(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1, 5000, 1600), { width: 1, height: 1600 });
});
