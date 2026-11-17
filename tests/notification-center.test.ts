import assert from 'node:assert/strict';
import test from 'node:test';
import { markLinkRead, notificationSummary } from '../src/features/notifications/service/center.ts';
import { sendMessage } from '../src/features/market/service/messages.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, flush, publishFixed, sellerWithBird, status } from './helpers/market.ts';

test('el resumen cuenta los mensajes sin leer y lista las conversaciones con novedades', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    const first = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Hola, ¿sigue disponible?' });
    await sendMessage(env.store, ctx(env, beto), { threadId: first.threadId, body: '¿Entregas en Medellín?' });
    await flush(env);
    const summary = await notificationSummary(env.store, ana);
    assert.equal(summary.unreadMessages, 2);
    assert.deepEqual(summary.messageThreads, [first.threadId]);
    assert.equal((await notificationSummary(env.store, beto)).unreadMessages, 0);
  } finally { await env.cleanup(); }
});

test('marcar una conversación como leída solo afecta sus mensajes y solo los de quien lo pide', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const one = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Hola desde Beto' });
    const two = await sendMessage(env.store, ctx(env, carla), { listingId: listing.id, body: 'Hola desde Carla' });
    await flush(env);
    assert.equal((await notificationSummary(env.store, ana)).unreadMessages, 2);
    assert.equal(await markLinkRead(env.store, beto, 'market.message.created', one.threadId, env.now), 0); // Beto no es destinatario de esos avisos
    assert.equal((await notificationSummary(env.store, ana)).unreadMessages, 2);
    assert.equal(await markLinkRead(env.store, ana, 'market.message.created', one.threadId, env.now), 1);
    const after = await notificationSummary(env.store, ana);
    assert.equal(after.unreadMessages, 1);
    assert.deepEqual(after.messageThreads, [two.threadId]);
    await assert.rejects(markLinkRead(env.store, ana, 'x'.repeat(100), one.threadId, env.now), status(400));
  } finally { await env.cleanup(); }
});
