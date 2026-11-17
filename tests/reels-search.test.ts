import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { matchesTerms, searchTerms } from '../src/features/profile/service/reel-search.ts';
import { listPublicReels } from '../src/features/profile/service/posts.ts';
import { createListing } from '../src/features/market/service/listings.ts';
import { DEMO_MARKET_LISTINGS } from '../src/features/market/service/demo-listings.ts';
import { DEMO_USER_IDS } from '../src/server/demo-ids.ts';
import { syncDemoCommunity } from '../src/server/demo-community.ts';
import { bird, makeEnv } from './helpers/env.ts';
import { ctx, deps } from './helpers/market.ts';

test('los términos se normalizan: sin tildes, en minúsculas, plurales simples y con tope', () => {
  assert.deepEqual(searchTerms('  Gallinas   CRIOLLÁS  '), ['gallina', 'criolla']);
  assert.deepEqual(searchTerms('#Brahma huevos'), ['brahma', 'huevo']);
  assert.deepEqual(searchTerms(''), []);
  assert.equal(searchTerms('a '.repeat(30)).length <= 8, true);
  assert.equal(searchTerms('x'.repeat(200))[0]!.length <= 40, true);
});

test('un texto coincide solo si contiene todos los términos', () => {
  const text = 'Gallina criolla mansa ponedora en Envigado';
  assert.equal(matchesTerms(text, searchTerms('gallinas mansa')), true);
  assert.equal(matchesTerms(text, searchTerms('criolla envigado')), true);
  assert.equal(matchesTerms(text, searchTerms('criolla brahma')), false);
  assert.equal(matchesTerms(text, []), true, 'sin términos, todo coincide');
});

async function scene() {
  const env = await makeEnv();
  const ana = await env.addUser('Valentina'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { birds: [bird({ id: 'luna', name: 'Luna', code: 'AVE-0003', breed: 'Criolla', sex: 'Gallina' })] });
  await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true, consent: { description: 'Mansa y muy buena ponedora', deliveryZone: 'Envigado' } });
  const at = env.now.toISOString();
  await env.store.tx(async tx => {
    await tx.posts.insert({ id: randomUUID(), authorId: beto, text: 'Mis pollitos Brahma de la semana #Brahma #Levante', mediaIds: [], createdAt: at, updatedAt: at });
  });
  return { env, ana, beto };
}
const ids = (page: Awaited<ReturnType<typeof listPublicReels>>) => page.items.map(item => item.kind);

test('buscar por raza, tipo, nombre, descripción, zona, texto, etiqueta y autor', async () => {
  const { env, ana, beto } = await scene();
  try {
    const search = (q: string) => listPublicReels(env.store, { q }, ana);
    assert.equal((await search('')).items.length, 2);
    assert.deepEqual(ids(await search('criolla')), ['advertisement']);
    assert.deepEqual(ids(await search('Criolla mansa')), ['advertisement']);
    assert.deepEqual(ids(await search('gallinas')), ['advertisement'], 'el sexo del ave también se busca (plural)');
    assert.deepEqual(ids(await search('luna')), ['advertisement'], 'nombre del ave');
    assert.deepEqual(ids(await search('ponedora envigado')), ['advertisement'], 'descripción y zona');
    assert.deepEqual(ids(await search('precio fijo')), ['advertisement'], 'tipo de publicación');
    assert.deepEqual(ids(await search('mercado')), ['advertisement'], 'la palabra mercado filtra los avisos de venta');
    assert.deepEqual(ids(await search('brahma')), ['post'], 'texto y etiqueta de una publicación');
    assert.deepEqual(ids(await search('#levante')), ['post']);
    assert.deepEqual(ids(await search('beto')), ['post'], 'nombre del autor');
    assert.deepEqual(ids(await search('valentina')), ['advertisement'], 'nombre del vendedor');
    assert.deepEqual((await search('criolla brahma')).items, [], 'todos los términos deben coincidir');
    assert.deepEqual((await search('zzzzzz')).items, []);
    void beto;
  } finally { await env.cleanup(); }
});

test('la búsqueda también encuentra las publicaciones de muestra del mercado', async () => {
  const env = await makeEnv();
  try {
    const viewer = await env.addUser('Carla');
    await syncDemoCommunity(env.store, env.now);
    const page = await listPublicReels(env.store, { q: 'pollitos' }, viewer);
    assert.ok(page.items.some(item => item.kind === 'sample-advertisement' && item.listing.id === 'demo-market-pollitos'));
    assert.ok(page.items.every(item => item.kind !== 'sample-advertisement' || (Object.values(DEMO_USER_IDS) as string[]).includes(item.listing.sellerId)));
    assert.equal(DEMO_MARKET_LISTINGS.length >= 2, true);
  } finally { await env.cleanup(); }
});

test('la búsqueda se combina con la etiqueta y con la paginación', async () => {
  const { env, ana } = await scene();
  try {
    assert.deepEqual((await listPublicReels(env.store, { q: 'brahma', tag: 'levante' }, ana)).items.map(item => item.kind), ['post']);
    assert.deepEqual((await listPublicReels(env.store, { q: 'criolla', tag: 'levante' }, ana)).items, [], 'con etiqueta no hay avisos del mercado');
    const first = await listPublicReels(env.store, { q: 'a', limit: 1 }, ana);
    assert.equal(first.items.length, 1);
  } finally { await env.cleanup(); }
});
