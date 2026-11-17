import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT_TYPES } from '../src/features/notifications/service/event-registry.ts';
import { emit } from '../src/features/notifications/service/events.ts';
import { processOutbox } from '../src/features/notifications/service/outbox.ts';
import { listNotifications } from '../src/features/notifications/service/center.ts';
import { BACKOFF_MS, MAX_ATTEMPTS, processDeliveries } from '../src/features/notifications/service/deliveries.ts';
import { channelStatus } from '../src/features/notifications/service/channels.ts';
import type { ChannelProvider, DeliveryContext, ProviderRegistry } from '../src/features/notifications/service/channels.ts';
import { buildProviders } from '../src/features/notifications/service/providers.ts';
import { updatePreferences } from '../src/features/notifications/service/preferences.ts';
import { runAllJobs } from '../src/server/jobs.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';

const NOW = new Date('2026-10-14T15:00:00.000Z'); // 10:00 Bogotá
const later = (ms: number) => new Date(NOW.getTime() + ms);

function fakeProvider(id: 'email' | 'browser', behavior: { fail?: () => boolean; removeEndpoints?: string[] } = {}) {
  const sent: DeliveryContext[] = [];
  const provider: ChannelProvider = { id, async send(context) { if (behavior.fail?.()) throw new Error('SMTP caído'); sent.push(context); return behavior.removeEndpoints ? { removeEndpoints: behavior.removeEndpoints } : undefined; } };
  return { provider, sent };
}
async function setup(env: TestEnv, prefs: Record<string, unknown> = { channels: { email: true } }) {
  const userId = await env.addUser('Ana');
  await env.store.tx(tx => updatePreferences(tx, userId, prefs, NOW));
  return userId;
}
const payload = (env: TestEnv, userId: string, key: string, product: string, now = NOW) => env.store.tx(tx => emit(tx, { type: 'stock.low', aggregateType: 'stock', aggregateId: product, payload: { userId, product, quantity: 1, unit: 'kg', minimum: 5 }, dedupeKey: key, now }));

test('un canal sin proveedor configurado no crea entregas y la app sigue funcionando con la bandeja interna', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env, { channels: { email: true, browser: true, push: true } });
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers: {} });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
    assert.equal((await env.store.tx(tx => tx.deliveries.list())).length, 0);
    assert.deepEqual(await processDeliveries(env.store, later(60_000), {}), { sent: 0, retrying: 0, failed: 0, skipped: 0 });
    assert.deepEqual(buildProviders({}), {});
    const status = channelStatus({});
    assert.equal(status.find(ch => ch.id === 'inApp')?.configured, true);
    for (const id of ['browser', 'email', 'push']) assert.equal(status.find(ch => ch.id === id)?.configured, false);
    assert.match(status.find(ch => ch.id === 'email')!.detail, /No configurado/);
    assert.match(status.find(ch => ch.id === 'push')!.detail, /No disponible/);
  } finally { await env.cleanup(); }
});

test('con credenciales, el canal figura como disponible y se construye su proveedor', () => {
  const env = { SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'avisos@example.test', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@example.test' };
  assert.deepEqual(Object.keys(buildProviders(env)).sort(), ['browser', 'email']);
  const status = channelStatus(env);
  assert.equal(status.find(ch => ch.id === 'email')?.configured, true);
  assert.equal(status.find(ch => ch.id === 'browser')?.vapidPublicKey, 'pub');
  assert.equal(JSON.stringify(status).includes('priv'), false); // la clave privada nunca sale
});

test('un fallo del proveedor externo no elimina la notificación interna y se reintenta con retroceso', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env);
    let failing = true;
    const { provider, sent } = fakeProvider('email', { fail: () => failing });
    const providers: ProviderRegistry = { email: provider };
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers });
    assert.equal((await env.store.tx(tx => tx.deliveries.list()))[0].status, 'pending');

    assert.deepEqual(await processDeliveries(env.store, NOW, providers), { sent: 0, retrying: 1, failed: 0, skipped: 0 });
    let delivery = (await env.store.tx(tx => tx.deliveries.list()))[0];
    assert.equal(delivery.attempts, 1); assert.match(delivery.lastError ?? '', /SMTP caído/); assert.equal(delivery.status, 'pending');
    assert.equal(delivery.nextAttemptAt, later(BACKOFF_MS[0]).toISOString());
    assert.equal((await listNotifications(env.store, ana)).length, 1); // la interna sigue intacta

    // antes del plazo no reintenta; después sí, y al recuperarse se envía una sola vez
    assert.equal((await processDeliveries(env.store, later(30_000), providers)).retrying, 0);
    failing = false;
    assert.equal((await processDeliveries(env.store, later(BACKOFF_MS[0] + 1000), providers)).sent, 1);
    delivery = (await env.store.tx(tx => tx.deliveries.list()))[0];
    assert.equal(delivery.status, 'sent'); assert.equal(delivery.attempts, 2);
    assert.equal((await processDeliveries(env.store, later(10 * 3_600_000), providers)).sent, 0);
    assert.equal(sent.length, 1);
  } finally { await env.cleanup(); }
});

test('tras agotar los reintentos la entrega queda fallida y la notificación interna se conserva', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env);
    const { provider } = fakeProvider('email', { fail: () => true });
    const providers: ProviderRegistry = { email: provider };
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers });
    let clock = NOW.getTime();
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { await processDeliveries(env.store, new Date(clock), providers); clock += 7 * 3_600_000; }
    const delivery = (await env.store.tx(tx => tx.deliveries.list()))[0];
    assert.equal(delivery.status, 'failed'); assert.equal(delivery.attempts, MAX_ATTEMPTS); assert.match(delivery.lastError ?? '', /SMTP/);
    assert.equal((await listNotifications(env.store, ana)).length, 1);
  } finally { await env.cleanup(); }
});

test('el horario de silencio aplaza los avisos normales pero no los críticos', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env, { channels: { email: true }, quietHours: { enabled: true, start: '22:00', end: '06:00' }, timeZone: 'America/Bogota' });
    const { provider, sent } = fakeProvider('email');
    const providers: ProviderRegistry = { email: provider };
    const night = new Date('2026-10-15T03:30:00.000Z'); // 22:30 en Bogotá
    await payload(env, ana, 'normal', 'Maíz', night);
    await env.store.tx(tx => emit(tx, { type: 'market.operation.cancelled', aggregateType: 'operation', aggregateId: 'x', payload: { operationId: 'x' }, dedupeKey: 'crit', now: night }));
    // el evento crítico necesita una operación real: se crea una mínima
    await env.store.tx(async tx => { await tx.operations.insert({ id: 'x', listingId: 'l', birdId: 'b', sellerId: ana, buyerId: 'otra', origin: 'directa', price: 1, status: 'cancelada', shareContact: { seller: false, buyer: false }, history: [], createdAt: '', updatedAt: '', version: 1, cancelReason: 'Motivo de prueba largo' }); });
    await processOutbox(env.store, night, { registry: EVENT_TYPES, providers });
    const rows = await env.store.tx(tx => tx.deliveries.list());
    const normal = rows.find(row => row.notBefore > night.toISOString());
    assert.ok(normal, 'el aviso normal queda aplazado');
    assert.equal(normal!.notBefore, '2026-10-15T11:00:00.000Z'); // 06:00 en Bogotá
    assert.equal(rows.filter(row => row.notBefore === night.toISOString()).length, 1); // el crítico sale ya
    await processDeliveries(env.store, night, providers);
    assert.equal(sent.length, 1);
    await processDeliveries(env.store, new Date('2026-10-15T11:05:00.000Z'), providers);
    assert.equal(sent.length, 2);
  } finally { await env.cleanup(); }
});

test('el usuario elige qué categorías recibe por cada canal', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env, { channels: { email: true }, channelCategories: { email: ['comercial'] } });
    const { provider } = fakeProvider('email');
    await payload(env, ana, 'k1', 'Maíz'); // categoría inventario
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers: { email: provider } });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
    assert.equal((await env.store.tx(tx => tx.deliveries.list())).length, 0);
    await env.store.tx(tx => updatePreferences(tx, ana, { channelCategories: { email: ['inventario'] } }, NOW));
    await payload(env, ana, 'k2', 'Sal');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers: { email: provider } });
    assert.equal((await env.store.tx(tx => tx.deliveries.list())).length, 1);
    await assert.rejects(env.store.tx(tx => updatePreferences(tx, ana, { channelCategories: { email: ['inventada'] } }, NOW)), /Categorías por canal/);
  } finally { await env.cleanup(); }
});

test('un canal desactivado por el usuario no genera entregas', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env, { channels: { email: false } });
    const { provider, sent } = fakeProvider('email');
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers: { email: provider } });
    await processDeliveries(env.store, NOW, { email: provider });
    assert.equal(sent.length, 0);
  } finally { await env.cleanup(); }
});

test('el envío usa solo los datos de la propia cuenta y nunca el contacto de terceros', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env), beto = await env.addUser('Beto');
    const { provider, sent } = fakeProvider('email');
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers: { email: provider } });
    await processDeliveries(env.store, NOW, { email: provider });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].user.id, ana); assert.equal(sent[0].notification.userId, ana);
    assert.equal(JSON.stringify(sent[0].notification).includes('beto@'), false);
    assert.equal((await env.store.tx(tx => tx.deliveries.list({ userId: beto }))).length, 0);
  } finally { await env.cleanup(); }
});

test('Web Push: sin suscripción se omite; con suscripción se envía y los endpoints vencidos se eliminan', async () => {
  const env = await makeEnv();
  try {
    const ana = await setup(env, { channels: { browser: true } });
    const { provider, sent } = fakeProvider('browser', { removeEndpoints: ['https://push.example.test/vencido'] });
    const providers: ProviderRegistry = { browser: provider };
    await payload(env, ana, 'k1', 'Maíz');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers });
    assert.equal((await processDeliveries(env.store, NOW, providers)).skipped, 1);
    assert.match((await env.store.tx(tx => tx.deliveries.list()))[0].lastError ?? '', /Sin suscripción/);

    await env.store.tx(async tx => {
      await tx.pushSubscriptions.insert({ id: 'a', userId: ana, endpoint: 'https://push.example.test/vigente', keys: { p256dh: 'x', auth: 'y' }, createdAt: NOW.toISOString() });
      await tx.pushSubscriptions.insert({ id: 'b', userId: ana, endpoint: 'https://push.example.test/vencido', keys: { p256dh: 'x', auth: 'y' }, createdAt: NOW.toISOString() });
    });
    await payload(env, ana, 'k2', 'Sal');
    await processOutbox(env.store, NOW, { registry: EVENT_TYPES, providers });
    assert.equal((await processDeliveries(env.store, NOW, providers)).sent, 1);
    assert.equal(sent[0].subscriptions.length, 2);
    assert.deepEqual((await env.store.tx(tx => tx.pushSubscriptions.list())).map(row => row.endpoint), ['https://push.example.test/vigente']);
  } finally { await env.cleanup(); }
});

test('el trabajo programado ejecuta recordatorios, notificaciones y entregas de punta a punta', async () => {
  const env = await makeEnv();
  const original = { host: process.env.SMTP_HOST, from: process.env.SMTP_FROM };
  try {
    const ana = await setup(env, { channels: { email: false } });
    await env.saveFarm(ana, { stock: [{ id: 's1', product: 'Maíz', category: 'Alimento', quantity: 1, unit: 'kg', minimum: 5 }] });
    delete process.env.SMTP_HOST; delete process.env.SMTP_FROM; // sin canales externos: el trabajo igual funciona
    const result = await runAllJobs(env.store, NOW);
    assert.equal(result.reminders.emitted >= 1, true);
    assert.equal((await listNotifications(env.store, ana)).some(row => row.type === 'stock.low'), true);
    assert.equal(result.deliveries.sent, 0);
  } finally { process.env.SMTP_HOST = original.host; process.env.SMTP_FROM = original.from; if (!original.host) delete process.env.SMTP_HOST; if (!original.from) delete process.env.SMTP_FROM; await env.cleanup(); }
});
