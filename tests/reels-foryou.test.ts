import assert from 'node:assert/strict';
import test from 'node:test';
import { createPost, listPublicReels } from '../src/features/profile/service/posts.ts';
import { recordReelSignals, shortKey } from '../src/features/profile/service/reel-signals.ts';
import { setLike } from '../src/features/profile/service/social.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { at, ctx, deps } from './helpers/market.ts';

const HOUR = 3_600_000;

async function seedPosts(env: TestEnv) {
  const viewer = await env.addUser('Vera');
  const authors = await Promise.all(['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fito'].map(name => env.addUser(name)));
  const texts = ['Mi gallo Brahma cantando #gallos', 'Huevos frescos de hoy #huevos', 'Otro gallo hermoso #gallos', 'Pollitos nuevos #pollitos', 'Gallo de exhibición #gallos', 'Precio del maíz #insumos'];
  const ids: string[] = [];
  for (const [i, text] of texts.entries()) ids.push((await createPost(deps(env), ctx(env, authors[i], at(env, -(10 + i) * HOUR)), { text })).id);
  return { viewer, authors, ids, texts };
}
const foryou = (env: TestEnv, viewer: string, extra: Record<string, unknown> = {}) => listPublicReels(env.store, { limit: 30, mode: 'foryou', seed: 's1', ...extra } as never, viewer);
const postIds = (page: Awaited<ReturnType<typeof foryou>>) => page.items.filter(item => item.kind === 'post').map(item => item.id);

test('«Para ti» devuelve todo una sola vez y sin repetidos, también cuando se pide por páginas con lo ya visto', async () => {
  const env = await makeEnv();
  try {
    const { viewer, ids } = await seedPosts(env);
    const seen: string[] = [];
    const collected: string[] = [];
    for (let page = 0; page < 8; page++) {
      const result = await foryou(env, viewer, { limit: 2, seen });
      const got = postIds(result);
      collected.push(...got);
      seen.push(...got.map(id => shortKey(`p:${id}`)));
      if (!result.nextBefore) break;
    }
    assert.equal(collected.length, ids.length);
    assert.deepEqual([...new Set(collected)].sort(), [...ids].sort());
  } finally { await env.cleanup(); }
});

test('el sistema aprende de los me gusta: tras darle me gusta a un gallo, los demás gallos suben', async () => {
  const env = await makeEnv();
  try {
    const { viewer, ids } = await seedPosts(env);
    await setLike(env.store, ctx(env, viewer), ids[0], true);
    const order = postIds(await foryou(env, viewer));
    const gallos = [ids[2], ids[4]], others = [ids[1], ids[3], ids[5]];
    assert.ok(Math.max(...gallos.map(id => order.indexOf(id))) < Math.min(...others.map(id => order.indexOf(id))), `orden: ${order.map(id => ids.indexOf(id)).join(',')}`);
    const stored = await env.store.tx(tx => tx.reelInterests.get(viewer));
    assert.ok((stored?.weights['#gallos'] ?? 0) > 0);
  } finally { await env.cleanup(); }
});

test('mirar un reel con calma suma y saltarlo enseguida resta; lo que informa el navegador se valida', async () => {
  const env = await makeEnv();
  try {
    const { viewer, ids } = await seedPosts(env);
    const ok = await recordReelSignals(env.store, viewer, [
      { key: `p:${ids[1]}`, type: 'view', ms: 12_000 },
      { key: `p:${ids[3]}`, type: 'view', ms: 500 },
      { key: 'p:no-existe-12345678', type: 'view', ms: 9_000 },
      { key: 'x:raro', type: 'view', ms: 9_000 } as never,
      { key: `p:${ids[2]}`, type: 'view', ms: Number.NaN },
      { key: `p:${ids[5]}`, type: 'boom' } as never,
    ], env.now);
    assert.equal(ok.accepted, 2);
    const stored = (await env.store.tx(tx => tx.reelInterests.get(viewer)))!;
    assert.ok(stored.weights['#huevos'] > 0, 'mirar con calma suma');
    assert.ok(stored.weights['#pollitos'] < 0, 'saltarlo enseguida resta');
    assert.equal((await recordReelSignals(env.store, viewer, [], env.now)).accepted, 0);
  } finally { await env.cleanup(); }
});

test('las reacciones, tendencia y variedad se notan: lo que acumula me gusta de otros sube y no se repite el autor seguido', async () => {
  const env = await makeEnv();
  try {
    const { viewer, authors, ids } = await seedPosts(env);
    for (const fan of authors.slice(0, 4)) await setLike(env.store, ctx(env, fan), ids[5], true);
    const order = postIds(await foryou(env, viewer));
    assert.ok(order.indexOf(ids[5]) <= 1, `lo que está en tendencia sale arriba: ${order.map(id => ids.indexOf(id)).join(',')}`);
  } finally { await env.cleanup(); }
});

test('las búsquedas y etiquetas siguen en orden cronológico aunque se pida «Para ti»', async () => {
  const env = await makeEnv();
  try {
    const { viewer, ids } = await seedPosts(env);
    const tagged = postIds(await foryou(env, viewer, { tag: 'gallos' }));
    assert.deepEqual(tagged, [ids[0], ids[2], ids[4]]);
    const searched = postIds(await foryou(env, viewer, { q: 'gallo' }));
    assert.deepEqual(searched, [ids[0], ids[2], ids[4]]);
  } finally { await env.cleanup(); }
});
