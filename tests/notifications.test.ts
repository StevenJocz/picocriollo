import assert from 'node:assert/strict';
import test from 'node:test';
import { emit } from '../src/features/notifications/service/events.ts';
import type { EventRegistry } from '../src/features/notifications/service/events.ts';
import { processOutbox } from '../src/features/notifications/service/outbox.ts';
import { listNotifications, markAllRead, markRead, notificationSummary } from '../src/features/notifications/service/center.ts';
import { getPreferences, updatePreferences } from '../src/features/notifications/service/preferences.ts';
import { makeEnv } from './helpers/env.ts';

const registryFor = (recipient: string, options: { critical?: boolean; category?: 'comercial' | 'seguridad'; preference?: 'offers' | 'interests' } = {}): EventRegistry => ({
  'test.event': {
    category: options.category ?? 'comercial', priority: 'normal', critical: options.critical ?? false, preference: options.preference,
    recipients: async () => [recipient],
    render: async (_tx, event) => ({ title: 'Evento de prueba', body: `Sobre ${String(event.payload.name)}`, link: { view: 'mercado', id: event.aggregateId } }),
  },
});
const input = (key: string, now: Date) => ({ type: 'test.event', aggregateType: 'listing', aggregateId: 'l1', payload: { name: 'Luna' }, dedupeKey: key, now });

test('el evento genera una notificación solo para el destinatario correcto', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    await env.store.tx(tx => emit(tx, input('k1', env.now)));
    const result = await processOutbox(env.store, env.now, { registry: registryFor(ana) });
    assert.deepEqual(result, { processed: 1, created: 1, failed: 0 });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
    assert.equal((await listNotifications(env.store, beto)).length, 0);
    const [note] = await listNotifications(env.store, ana);
    assert.equal(note.title, 'Evento de prueba');
    assert.deepEqual(note.link, { view: 'mercado', id: 'l1' });
    assert.doesNotMatch(JSON.stringify(note), /correo\.test|secreto-hash/);
  } finally { await env.cleanup(); }
});

test('reprocesar o emitir dos veces el mismo evento no duplica notificaciones', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), registry = registryFor(ana);
    assert.equal(await env.store.tx(tx => emit(tx, input('k1', env.now))), true);
    assert.equal(await env.store.tx(tx => emit(tx, input('k1', env.now))), false);
    await processOutbox(env.store, env.now, { registry });
    await processOutbox(env.store, env.now, { registry });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
    // Aunque se fuerce el reproceso del mismo evento, la unicidad por usuario lo impide.
    await env.store.tx(async tx => { const row = (await tx.outbox.list())[0]; await tx.outbox.update({ ...row, status: 'pending' }); });
    const again = await processOutbox(env.store, env.now, { registry });
    assert.equal(again.created, 0);
    assert.equal((await listNotifications(env.store, ana)).length, 1);
  } finally { await env.cleanup(); }
});

test('si la transacción de negocio falla no queda evento ni notificación', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await assert.rejects(env.store.tx(async tx => { await emit(tx, input('k1', env.now)); throw new Error('negocio falló'); }), /negocio falló/);
    await processOutbox(env.store, env.now, { registry: registryFor(ana) });
    assert.equal((await listNotifications(env.store, ana)).length, 0);
    assert.equal((await env.store.tx(tx => tx.outbox.list())).length, 0);
  } finally { await env.cleanup(); }
});

test('una categoría desactivada no genera notificación, pero una crítica sí', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.store.tx(tx => updatePreferences(tx, ana, { categories: { comercial: false, seguridad: false } }, env.now));
    await env.store.tx(tx => emit(tx, input('k1', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana) });
    assert.equal((await listNotifications(env.store, ana)).length, 0);
    await env.store.tx(tx => emit(tx, input('k2', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana, { critical: true, category: 'seguridad' }) });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
  } finally { await env.cleanup(); }
});

test('la preferencia comercial silencia ofertas sin tocar otras categorías', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.store.tx(tx => updatePreferences(tx, ana, { commercial: { offers: false } }, env.now));
    await env.store.tx(tx => emit(tx, input('k1', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana, { preference: 'offers' }) });
    assert.equal((await listNotifications(env.store, ana)).length, 0);
    await env.store.tx(tx => emit(tx, input('k2', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana, { preference: 'interests' }) });
    assert.equal((await listNotifications(env.store, ana)).length, 1);
  } finally { await env.cleanup(); }
});

test('un tipo de evento desconocido se reintenta y termina en failed sin afectar a los demás', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.store.tx(async tx => { await emit(tx, { ...input('malo', env.now), type: 'no.existe' }); await emit(tx, input('bueno', new Date(env.now.getTime() + 1000))); });
    for (let i = 0; i < 3; i++) await processOutbox(env.store, env.now, { registry: registryFor(ana), maxAttempts: 3 });
    const rows = await env.store.tx(tx => tx.outbox.list());
    assert.equal(rows.find(row => row.dedupeKey === 'malo')?.status, 'failed');
    assert.match(rows.find(row => row.dedupeKey === 'malo')?.lastError ?? '', /desconocido/);
    assert.equal(rows.find(row => row.dedupeKey === 'bueno')?.status, 'processed');
    assert.equal((await listNotifications(env.store, ana)).length, 1);
  } finally { await env.cleanup(); }
});

test('marcar como leída solo funciona con notificaciones propias', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    await env.store.tx(tx => emit(tx, input('k1', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana) });
    const [note] = await listNotifications(env.store, ana);
    await assert.rejects(markRead(env.store, beto, [note.id], env.now), (error: { status?: number }) => error.status === 403);
    assert.equal((await notificationSummary(env.store, ana)).unread, 1);
    assert.equal(await markRead(env.store, ana, [note.id], env.now), 1);
    assert.equal((await notificationSummary(env.store, ana)).unread, 0);
    assert.equal((await listNotifications(env.store, ana, { status: 'no_leidas' })).length, 0);
    assert.equal((await listNotifications(env.store, ana, { status: 'leidas' })).length, 1);
    await env.store.tx(tx => emit(tx, input('k2', env.now)));
    await processOutbox(env.store, env.now, { registry: registryFor(ana) });
    assert.equal(await markAllRead(env.store, ana, env.now), 1);
    assert.equal(await markAllRead(env.store, beto, env.now), 0);
  } finally { await env.cleanup(); }
});

test('las preferencias se validan y la bandeja interna no se puede apagar', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const prefs = await env.store.tx(tx => updatePreferences(tx, ana, { channels: { inApp: false, email: true }, timeZone: 'America/Bogota', quietHours: { enabled: true, start: '21:30', end: '05:00' } }, env.now));
    assert.equal(prefs.channels.inApp, true);
    assert.equal(prefs.channels.email, true);
    await assert.rejects(env.store.tx(tx => updatePreferences(tx, ana, { timeZone: 'Marte/Olimpo' }, env.now)), /Zona horaria/);
    await assert.rejects(env.store.tx(tx => updatePreferences(tx, ana, { quietHours: { enabled: true, start: '25:00', end: '05:00' } }, env.now)), /silencio/);
    await assert.rejects(env.store.tx(tx => updatePreferences(tx, ana, { categories: { inventado: true } }, env.now)), /Categor/);
    assert.equal((await env.store.tx(tx => getPreferences(tx, ana))).quietHours.start, '21:30');
  } finally { await env.cleanup(); }
});
