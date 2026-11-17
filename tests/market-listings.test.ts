import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT_TYPES } from '../src/features/notifications/service/event-registry.ts';
import { processOutbox } from '../src/features/notifications/service/outbox.ts';
import { listNotifications } from '../src/features/notifications/service/center.ts';
import { addInterest, browseListings, createListing, getListingForViewer, listInterests, myListings, pauseListing, publishListing, refreshSnapshot, resumeListing, updateListing, withdrawInterest, withdrawListing } from '../src/features/market/service/listings.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const status = (code: number) => (error: { status?: number }) => error.status === code;
const deps = (env: TestEnv) => ({ store: env.store, media: env.media });
const ctx = (env: TestEnv, userId: string) => ({ userId, now: env.now });
const flush = (env: TestEnv) => processOutbox(env.store, env.now, { registry: EVENT_TYPES });

async function seller(env: TestEnv) {
  const ana = await env.addUser('Ana');
  await env.saveFarm(ana, {
    birds: [
      bird({ id: 'madre', name: 'Reina', code: 'AVE-0001', sex: 'Gallina', breed: 'Brahma', bornAt: '2024-01-10' }),
      bird({ id: 'padre', name: 'Tizón', code: 'AVE-0002', sex: 'Gallo', breed: 'Criolla', bornAt: '2024-01-10' }),
      bird({ id: 'luna', name: 'Luna', code: 'AVE-0003', sex: 'Gallina', breed: 'Criolla', bornAt: '2025-06-01', motherId: 'madre', fatherId: 'padre', photo: PNG }),
    ],
    rings: [{ id: 'r1', number: 7, birdId: 'luna', status: 'Asignado', assignedAt: '2025-07-01' }],
    birdEvents: [{ id: 'ev1', birdId: 'luna', kind: 'Salud', date: '2026-01-01', title: 'Desparasitación', details: 'DETALLE-SANITARIO-PRIVADO' }],
    births: [{ id: 'bi1', incubationId: 'i', date: '2026-01-02', count: 4, motherId: 'luna', fatherId: '', coopId: 'c', breed: 'Criolla', notes: '' }],
  });
  return ana;
}

test('un usuario no puede publicar aves de otro propietario', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    await assert.rejects(createListing(deps(env), ctx(env, beto), { birdId: 'luna', kind: 'fixed', price: 50000, publish: true }), status(403));
    await env.saveFarm(beto, { birds: [bird({ id: 'suya', name: 'Suya' })] });
    await assert.rejects(createListing(deps(env), ctx(env, beto), { birdId: 'luna', kind: 'fixed', price: 1000 }), status(403));
    assert.equal((await myListings(env.store, ana)).length, 0);
  } finally { await env.cleanup(); }
});

test('la publicación corresponde a la ficha real del ave y declara que no está verificada', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, terms: 'Entrega en finca', consent: { description: 'Ave tranquila', deliveryZone: 'Rionegro, Antioquia', showReproduction: true, healthNote: 'Sin enfermedades conocidas' }, publish: true });
    const s = listing.snapshot;
    assert.equal(s.name, 'Luna'); assert.equal(s.code, 'AVE-0003'); assert.equal(s.ring, 7); assert.equal(s.breed, 'Criolla'); assert.equal(s.sex, 'Gallina');
    assert.equal(s.bornAt, '2025-06-01'); assert.match(s.ageLabel, /meses/);
    assert.equal(s.genealogy?.mother?.name, 'Reina'); assert.equal(s.genealogy?.father?.name, 'Tizón');
    assert.equal(s.offspringCount, 4);
    assert.equal(s.declaredBySeller, true);
    assert.ok(s.photoId);
    assert.equal(listing.status, 'publicada');
    assert.equal(listing.price, 85000);
    const photo = await env.media.get(s.photoId!);
    assert.equal(photo?.mime, 'image/png');
    assert.ok(photo!.bytes.length > 10);
  } finally { await env.cleanup(); }
});

test('los datos privados nunca aparecen en el mercado ni en el detalle público', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, consent: { showBreeder: false }, publish: true });
    const browse = JSON.stringify(await browseListings(env.store, {}));
    const detail = JSON.stringify(await getListingForViewer(env.store, listing.id, beto));
    const anon = JSON.stringify(await getListingForViewer(env.store, listing.id));
    for (const payload of [browse, detail, anon]) {
      for (const secret of ['NOTA-PRIVADA-NO-PUBLICAR', 'DETALLE-SANITARIO-PRIVADO', 'correo.test', 'secreto-hash', 'sourceHash', 'birdId', 'consent']) {
        assert.equal(payload.includes(secret), false, `se filtró ${secret}`);
      }
      assert.match(payload, /Luna/);
    }
    assert.match(browse, /Ana/); // alias público del vendedor
    // El id del vendedor es público a propósito: enlaza al perfil del criador (/mercado/vendedor/[id]). No es un secreto de sesión.
    assert.equal(JSON.parse(anon).listing.sellerId, ana);
  } finally { await env.cleanup(); }
});

test('aves vendidas, fallecidas o ya publicadas no se pueden publicar de nuevo', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [bird({ id: 'v', status: 'Vendido' }), bird({ id: 'f', status: 'Fallecido' }), bird({ id: 'ok' })] });
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'v', kind: 'fixed', price: 1000 }), status(409));
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'f', kind: 'fixed', price: 1000 }), status(409));
    await createListing(deps(env), ctx(env, ana), { birdId: 'ok', kind: 'fixed', price: 1000, publish: true });
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'ok', kind: 'fixed', price: 2000 }), status(409));
  } finally { await env.cleanup(); }
});

test('dos publicaciones simultáneas de la misma ave: solo una gana', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const results = await Promise.allSettled([1, 2].map(() => createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 40000, publish: true })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 1);
  } finally { await env.cleanup(); }
});

test('un ave bloqueada por otra operación no se puede publicar', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const draft = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 40000 });
    await env.store.tx(tx => tx.locks.insert({ id: 'op-lock', birdId: 'luna', operationId: 'op1', status: 'active', createdAt: env.now.toISOString() }));
    await assert.rejects(publishListing(deps(env), ctx(env, ana), draft.id), status(409));
  } finally { await env.cleanup(); }
});

test('retirar libera el bloqueo y conserva la auditoría; luego se puede publicar otra vez', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 40000, publish: true });
    await withdrawListing(deps(env), ctx(env, ana), listing.id);
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 0);
    const actions = (await env.store.tx(tx => tx.audit.list({ targetId: listing.id }))).map(row => row.action).sort();
    assert.deepEqual(actions, ['listing.create', 'listing.publish', 'listing.withdraw']);
    await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 45000, publish: true });
    // y ahora sí se puede vender/marcar desde la granja de nuevo tras retirar
    await withdrawListing(deps(env), ctx(env, ana), (await myListings(env.store, ana, 'publicada'))[0].id);
    await env.saveFarm(ana, { birds: [bird({ id: 'luna', name: 'Luna', status: 'Vendido' })] });
  } finally { await env.cleanup(); }
});

test('cambiar la ficha marca la publicación para revisar sin alterar sus condiciones', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    await flush(env);
    const farm = await env.farm(ana);
    const birds = (farm.birds as Record<string, unknown>[]).map(b => b.id === 'luna' ? { ...b, name: 'Luna Nueva', breed: 'Brahma' } : b);
    await env.saveFarm(ana, { birds });
    const [after] = await myListings(env.store, ana);
    assert.equal(after.needsReview, true);
    assert.equal(after.snapshot.name, 'Luna'); // sin cambios silenciosos
    assert.equal(after.price, 85000);
    await flush(env);
    const notes = (await listNotifications(env.store, ana)).filter(n => n.type === 'market.listing.needs_review');
    assert.equal(notes.length, 1);
    // guardar otra vez sin más cambios no repite el aviso
    await env.saveFarm(ana, { birds });
    await flush(env);
    assert.equal((await listNotifications(env.store, ana)).filter(n => n.type === 'market.listing.needs_review').length, 1);
    await pauseListing(deps(env), ctx(env, ana), listing.id);
    await assert.rejects(resumeListing(deps(env), ctx(env, ana), listing.id), status(409));
    await refreshSnapshot(deps(env), ctx(env, ana), listing.id);
    const resumed = await resumeListing(deps(env), ctx(env, ana), listing.id);
    assert.equal(resumed.snapshot.name, 'Luna Nueva');
    assert.equal(resumed.needsReview, false);
  } finally { await env.cleanup(); }
});

test('otro usuario no puede pausar, retirar, editar ni consultar interesados de una publicación ajena', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    await assert.rejects(pauseListing(deps(env), ctx(env, beto), listing.id), status(403));
    await assert.rejects(withdrawListing(deps(env), ctx(env, beto), listing.id), status(403));
    await assert.rejects(updateListing(deps(env), ctx(env, beto), listing.id, { price: 1 }), status(403));
    await assert.rejects(listInterests(deps(env), ctx(env, beto), listing.id), status(403));
    assert.equal((await myListings(env.store, beto)).length, 0);
  } finally { await env.cleanup(); }
});

test('"Me interesa": notifica una vez al vendedor, no duplica y respeta permisos', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    await assert.rejects(addInterest(deps(env), ctx(env, ana), listing.id, 'yo'), status(403));
    await addInterest(deps(env), ctx(env, beto), listing.id, 'Me gustaría verla');
    await addInterest(deps(env), ctx(env, beto), listing.id, 'Me gustaría verla');
    await flush(env); await flush(env);
    const notes = (await listNotifications(env.store, ana)).filter(n => n.type === 'market.interest.created');
    assert.equal(notes.length, 1);
    assert.match(notes[0].body, /Beto/); assert.match(notes[0].body, /Me gustaría verla/);
    assert.doesNotMatch(JSON.stringify(notes), /correo\.test/);
    assert.equal((await listNotifications(env.store, beto)).length, 0);
    const interests = await listInterests(deps(env), ctx(env, ana), listing.id);
    assert.equal(interests.length, 1);
    assert.doesNotMatch(JSON.stringify(interests), /correo\.test|secreto-hash/);
    assert.equal(interests[0].userId, beto); // el id es público: enlaza al perfil del interesado
    assert.equal((await myListings(env.store, ana, 'con_interesados')).length, 1);
    const view = await getListingForViewer(env.store, listing.id, beto);
    assert.equal(view.viewer.hasInterest, true);
    await withdrawInterest(deps(env), ctx(env, beto), listing.id);
    assert.equal((await listInterests(deps(env), ctx(env, ana), listing.id)).length, 0);
    await addInterest(deps(env), ctx(env, beto), listing.id, 'Sigo interesado');
    await flush(env);
    assert.equal((await listNotifications(env.store, ana)).filter(n => n.type === 'market.interest.created').length, 2);
  } finally { await env.cleanup(); }
});

test('no se puede mostrar interés en publicaciones pausadas o retiradas', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    await pauseListing(deps(env), ctx(env, ana), listing.id);
    await assert.rejects(addInterest(deps(env), ctx(env, beto), listing.id, ''), status(404));
    await assert.rejects(getListingForViewer(env.store, listing.id, beto), status(404));
    assert.equal((await getListingForViewer(env.store, listing.id, ana)).viewer.isOwner, true);
    assert.equal((await browseListings(env.store, {})).total, 0);
  } finally { await env.cleanup(); }
});

test('validación de precio y tipo; el catálogo filtra', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 0 }), status(400));
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: -5 }), status(400));
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: Number.NaN }), status(400));
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'auction' as never, price: 10 }), status(400));
    await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    await createListing(deps(env), ctx(env, ana), { birdId: 'madre', kind: 'interest', publish: true });
    assert.equal((await browseListings(env.store, {})).total, 2);
    assert.equal((await browseListings(env.store, { breed: 'Brahma' })).items[0].snapshot.name, 'Reina');
    assert.equal((await browseListings(env.store, { min: 50000 })).total, 1);
    assert.equal((await browseListings(env.store, { q: 'zzz' })).total, 0);
  } finally { await env.cleanup(); }
});

test('la foto publicada es una copia: cambiar la ficha no altera lo ya publicado', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true });
    const before = await env.media.get(listing.snapshot.photoId!);
    const farm = await env.farm(ana);
    await env.saveFarm(ana, { birds: (farm.birds as Record<string, unknown>[]).map(b => b.id === 'luna' ? { ...b, photo: '' } : b) });
    const after = await env.media.get(listing.snapshot.photoId!);
    assert.deepEqual([...after!.bytes], [...before!.bytes]);
  } finally { await env.cleanup(); }
});
