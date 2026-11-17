import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import { normalizeLocation, proximityBucket, setLocation } from '../src/features/profile/service/location.ts';
import { browseListings, createListing } from '../src/features/market/service/listings.ts';
import { createPost, listPublicReels } from '../src/features/profile/service/posts.ts';
import { getSellerProfile } from '../src/features/market/service/seller-profile.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { at, ctx, deps, status } from './helpers/market.ts';

test('la ubicación se normaliza: ciudades conocidas toman su departamento y los acentos no importan', () => {
  assert.deepEqual(normalizeLocation({ city: 'medellin' }), { city: 'Medellín', region: 'Antioquia' });
  assert.deepEqual(normalizeLocation({ city: ' BOGOTÁ ', region: '' }), { city: 'Bogotá', region: 'Bogotá D.C.' });
  assert.deepEqual(normalizeLocation({ city: 'Vereda La Palma', region: 'Antioquia' }), { city: 'Vereda La Palma', region: 'Antioquia' }, 'lugares que no están en la lista se aceptan tal cual');
  assert.throws(() => normalizeLocation({ city: '' }), /ciudad/i);
  assert.throws(() => normalizeLocation({ city: 'x'.repeat(80) }), /ciudad/i);
  assert.throws(() => normalizeLocation({ city: 'Medellín <script>' }), /ciudad/i);
});

test('cercanía: misma ciudad primero, mismo departamento después, el resto al final', () => {
  const me = { city: 'Medellín', region: 'Antioquia' };
  assert.equal(proximityBucket(me, { city: 'medellin', region: 'Antioquia' }), 0);
  assert.equal(proximityBucket(me, { city: 'Rionegro', region: 'Antioquia' }), 1);
  assert.equal(proximityBucket(me, { city: 'Bogotá', region: 'Bogotá D.C.' }), 2);
  assert.equal(proximityBucket(me, undefined), 2);
  assert.equal(proximityBucket(undefined, { city: 'Bogotá' }), 0, 'sin ubicación propia no se prioriza nada');
  assert.equal(proximityBucket(me, 'Envigado, Antioquia'), 1, 'la zona de entrega de un aviso también cuenta');
  assert.equal(proximityBucket(me, 'Medellín, Antioquia'), 0);
});

test('guardar la ubicación valida y se ve en el perfil público', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    assert.deepEqual(await setLocation(deps(env), ctx(env, ana), { city: 'rionegro' }), { city: 'Rionegro', region: 'Antioquia' });
    assert.deepEqual((await getSellerProfile(env.store, ana, env.now)).location, { city: 'Rionegro', region: 'Antioquia' });
    await assert.rejects(setLocation(deps(env), ctx(env, ana), { city: 42 }), status(400));
    assert.deepEqual((await getSellerProfile(env.store, ana, env.now)).location, { city: 'Rionegro', region: 'Antioquia' }, 'un cambio inválido no toca lo guardado');
    assert.equal(await setLocation(deps(env), ctx(env, ana), { city: '' }), undefined, 'vacío quita la ubicación');
  } finally { await env.cleanup(); }
});

async function world(env: TestEnv) {
  const viewer = await env.addUser('Vera', { location: { city: 'Medellín', region: 'Antioquia' } });
  const far = await env.addUser('Lejos', { location: { city: 'Bogotá', region: 'Bogotá D.C.' } });
  const near = await env.addUser('Cerca', { location: { city: 'Medellín', region: 'Antioquia' } });
  const region = await env.addUser('Region', { location: { city: 'Rionegro', region: 'Antioquia' } });
  const nowhere = await env.addUser('Sinsitio');
  return { viewer, far, near, region, nowhere };
}

test('los reels muestran primero lo de mi ciudad, luego mi departamento y después lo demás (más nuevo primero dentro de cada grupo)', async () => {
  const env = await makeEnv();
  try {
    const { viewer, far, near, region, nowhere } = await world(env);
    // El orden de publicación (de más viejo a más nuevo): cerca, región, lejos, sin sitio, cerca otra vez.
    const mk = async (user: string, text: string, hours: number) => (await createPost(deps(env), ctx(env, user, at(env, hours * 3_600_000)), { text })).id;
    const nearOld = await mk(near, 'Cerca viejo', -10), regionPost = await mk(region, 'Región', -9), farPost = await mk(far, 'Lejos', -8), nowherePost = await mk(nowhere, 'Sin sitio', -7), nearNew = await mk(near, 'Cerca nuevo', -6);
    const ids = async (viewerId: string) => (await listPublicReels(env.store, { limit: 30 }, viewerId)).items.filter(item => item.kind === 'post').map(item => item.id);
    assert.deepEqual(await ids(viewer), [nearNew, nearOld, regionPost, nowherePost, farPost]);
    const plain = await env.addUser('Sin ubicación propia');
    assert.deepEqual(await ids(plain), [nearNew, nowherePost, farPost, regionPost, nearOld], 'sin ubicación el orden sigue siendo cronológico');
  } finally { await env.cleanup(); }
});

test('la paginación de los reels con prioridad por ubicación no repite ni se salta publicaciones', async () => {
  const env = await makeEnv();
  try {
    const { viewer, far, near, region } = await world(env);
    const created: string[] = [];
    for (let i = 0; i < 9; i++) {
      const author = [near, region, far][i % 3];
      created.push((await createPost(deps(env), ctx(env, author, at(env, (-20 + i) * 3_600_000)), { text: `Publicación ${i}` })).id);
    }
    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await listPublicReels(env.store, { limit: 2, ...(before ? { before } : {}) }, viewer);
      seen.push(...result.items.filter(item => item.kind === 'post').map(item => item.id));
      before = result.nextBefore;
      if (!before) break;
    }
    assert.equal(seen.length, 9);
    assert.equal(new Set(seen).size, 9, 'sin repetidos');
    const authorOf = async (id: string) => env.store.tx(async tx => (await tx.posts.get(id))!.authorId);
    const order = await Promise.all(seen.map(authorOf));
    assert.deepEqual(order, [near, near, near, region, region, region, far, far, far], 'primero mi ciudad, luego mi departamento, luego el resto');
  } finally { await env.cleanup(); }
});

test('el mercado prioriza los avisos de mi ciudad y mi departamento cuando conozco mi ubicación', async () => {
  const env = await makeEnv();
  try {
    const { far, near, region } = await world(env);
    for (const [user, hours] of [[near, -30], [region, -20], [far, -10]] as const) {
      await env.saveFarm(user, { birds: [bird({ id: `b-${user}`, name: `Ave de ${user.slice(0, 4)}` })] });
      await createListing(deps(env), ctx(env, user, at(env, hours * 3_600_000)), { birdId: `b-${user}`, kind: 'fixed', price: 70000, publish: true });
    }
    const sellerOrder = async (location?: { city: string; region?: string }) => (await browseListings(env.store, { location }, env.now)).items.map(item => item.sellerId);
    assert.deepEqual(await sellerOrder(), [far, region, near], 'sin ubicación: lo más nuevo primero');
    assert.deepEqual(await sellerOrder({ city: 'Medellín', region: 'Antioquia' }), [near, region, far]);
    assert.deepEqual(await sellerOrder({ city: 'Bogotá', region: 'Bogotá D.C.' }), [far, region, near], 'quien está en Bogotá ve primero lo de Bogotá y el resto por fecha');
  } finally { await env.cleanup(); }
});

test('al crear la cuenta se guarda la ciudad elegida y ya se prioriza lo cercano', async () => {
  const env = await makeEnv();
  try {
    const user = await createAccount(env.store, { email: 'nueva@correo.test', passwordHash: 'x', username: 'Nueva Criadora', location: normalizeLocation({ city: 'medellin' }) });
    assert.deepEqual(user.location, { city: 'Medell\u00edn', region: 'Antioquia' });
    assert.deepEqual((await getSellerProfile(env.store, user.id, env.now)).location, { city: 'Medell\u00edn', region: 'Antioquia' });
    const without = await createAccount(env.store, { email: 'otra@correo.test', passwordHash: 'x', username: 'Sin Ciudad' });
    assert.equal(without.location, undefined);
  } finally { await env.cleanup(); }
});
