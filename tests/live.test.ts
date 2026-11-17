import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_STREAMS_PER_USER, publish, publishMany, streamCount, subscribe } from '../src/server/live.ts';
import { EVENT_TYPES } from '../src/features/notifications/service/event-registry.ts';
import { processOutbox } from '../src/features/notifications/service/outbox.ts';
import { sendMessage } from '../src/features/market/service/messages.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, publishFixed, sellerWithBird } from './helpers/market.ts';

const listener = () => { const calls = { push: 0, close: 0 }; return { calls, api: { push: () => { calls.push++; }, close: () => { calls.close++; } } }; };

test('publish avisa solo a las conexiones del usuario y darse de baja detiene los avisos', () => {
  const a = listener(), b = listener();
  const offA = subscribe('u-live-a', a.api), offB = subscribe('u-live-b', b.api);
  publish('u-live-a');
  assert.deepEqual([a.calls.push, b.calls.push], [1, 0]);
  publishMany(['u-live-a', 'u-live-b', 'u-live-a']);
  assert.deepEqual([a.calls.push, b.calls.push], [2, 1]); // un aviso por usuario aunque se repita
  offA();
  publish('u-live-a');
  assert.equal(a.calls.push, 2);
  assert.equal(streamCount('u-live-a'), 0);
  offB();
});

test('un usuario tiene como máximo %d conexiones: la más antigua se cierra'.replace('%d', String(MAX_STREAMS_PER_USER)), () => {
  const all = Array.from({ length: MAX_STREAMS_PER_USER + 1 }, () => listener());
  const offs = all.map(item => subscribe('u-live-max', item.api));
  assert.equal(streamCount('u-live-max'), MAX_STREAMS_PER_USER);
  assert.equal(all[0].calls.close, 1);
  assert.ok(all.slice(1).every(item => item.calls.close === 0));
  for (const off of offs) off();
  assert.equal(streamCount('u-live-max'), 0);
});

test('un listener que falla no impide avisar a los demás', () => {
  const bad = { push: () => { throw new Error('socket cerrado'); }, close: () => undefined }, good = listener();
  const offs = [subscribe('u-live-err', bad), subscribe('u-live-err', good.api)];
  publish('u-live-err');
  assert.equal(good.calls.push, 1);
  for (const off of offs) off();
});

test('processOutbox avisa a los destinatarios solo después de crear sus notificaciones', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Hola' });
    const notified: string[][] = [];
    const first = await processOutbox(env.store, env.now, { registry: EVENT_TYPES, onNotified: users => notified.push(users) });
    assert.ok(first.created >= 1);
    assert.ok(notified.flat().includes(ana));
    assert.ok(!notified.flat().includes(beto)); // el autor del mensaje no recibe aviso de su propio mensaje
    const again = await processOutbox(env.store, env.now, { registry: EVENT_TYPES, onNotified: users => notified.push(users) });
    assert.equal(again.created, 0);
    const count = notified.length;
    await processOutbox(env.store, env.now, { registry: EVENT_TYPES, onNotified: users => notified.push(users) });
    assert.equal(notified.length, count);
  } finally { await env.cleanup(); }
});
