import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmData } from '../src/models/farm.ts';
import { estimatedHatch, planReminders, scanReminders, scanAllReminders } from '../src/features/notifications/service/reminders.ts';
import { defaultPreferences, isQuietNow, nextDeliveryTime, updatePreferences } from '../src/features/notifications/service/preferences.ts';
import { applyFarmSave } from '../src/features/market/service/farm-guard.ts';
import { addDays, dateInZone, daysBetween } from '../src/shared/time.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { notes } from './helpers/market.ts';

const NOW = new Date('2026-10-14T15:00:00.000Z'); // 10:00 en Bogotá
const TODAY = '2026-10-14';
const emptyFarm = (patch: Partial<FarmData> = {}): FarmData => ({ coops: [], birds: [], rings: [], birdEvents: [], eggs: [], incubations: [], births: [], breedingGroups: [], purchases: [], stock: [], movements: [], maintenance: [], fertileLots: [], chickLots: [], customers: [], sales: [], lotMovements: [], customProducts: [], ...patch });
const inc = (startedAt: string, extra: Record<string, unknown> = {}) => ({ id: 'inc1', henId: 'hen1', coopId: 'c1', startedAt, eggs: 8, hatched: 0, removed: 0, status: 'En curso', notes: '', type: 'Natural', updatedAt: NOW.toISOString(), ...extra }) as FarmData['incubations'][number];
const plan = (farm: FarmData, prefsPatch: Record<string, unknown> = {}, now = NOW) => planReminders({ farm, prefs: { ...defaultPreferences('u1', now), ...prefsPatch }, now, userId: 'u1' });
const types = (plans: { type: string }[]) => plans.map(p => p.type).sort();

test('la fecha estimada de eclosión suma 21 días más el ajuste (sin depender de la zona del servidor)', () => {
  assert.equal(estimatedHatch({ startedAt: '2026-10-01', type: 'Natural' }), '2026-10-22');
  assert.equal(estimatedHatch({ startedAt: '2026-10-01', type: 'Artificial', hatchAdjustmentDays: -1 }), '2026-10-21');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-10-14', '2026-10-17'), 3);
});

test('eclosión próxima solo dentro de la anticipación configurada', () => {
  const farm = emptyFarm({ incubations: [inc(addDays(TODAY, -19))] }); // estimada en 2 días
  assert.deepEqual(types(plan(farm, { incubationLeadDays: 3 })), ['incubation.hatch_approaching']);
  assert.deepEqual(types(plan(farm, { incubationLeadDays: 1 })), []);
  assert.deepEqual(types(plan(emptyFarm({ incubations: [inc(addDays(TODAY, -10))] }), { incubationLeadDays: 3 })), []);
});

test('hoy es la fecha estimada: avisa sin afirmar que nacieron', () => {
  const [item] = plan(emptyFarm({ incubations: [inc(addDays(TODAY, -21))] }));
  assert.equal(item.type, 'incubation.hatch_today');
  assert.equal(item.payload.estimated, TODAY);
});

test('la incubación vencida respeta el margen configurable y se silencia si ya hay un nacimiento', () => {
  const late = emptyFarm({ incubations: [inc(addDays(TODAY, -24))] }); // 3 días tarde
  assert.deepEqual(types(plan(late, { incubationMarginDays: 2 })), ['incubation.overdue']);
  assert.deepEqual(types(plan(late, { incubationMarginDays: 5 })), []);
  const withBirth = emptyFarm({ incubations: [inc(addDays(TODAY, -24))], births: [{ id: 'b1', incubationId: 'inc1', date: TODAY, count: 3, motherId: '', fatherId: '', coopId: 'c1', breed: 'Criolla', notes: '' }] });
  assert.deepEqual(types(plan(withBirth, { incubationMarginDays: 2, incubationStaleDays: 99 })), []);
});

test('el ajuste de días y las incubaciones finalizadas se tienen en cuenta', () => {
  assert.deepEqual(types(plan(emptyFarm({ incubations: [inc(addDays(TODAY, -21), { hatchAdjustmentDays: 2 })] }))), ['incubation.hatch_approaching']); // ahora faltan 2 días
  assert.deepEqual(types(plan(emptyFarm({ incubations: [inc(addDays(TODAY, -21), { status: 'Finalizada' })] }))), []);
});

test('incubación sin actualizar: usa updatedAt y el umbral configurable', () => {
  const stale = emptyFarm({ incubations: [inc(addDays(TODAY, -10), { updatedAt: `${addDays(TODAY, -9)}T12:00:00.000Z` })] });
  assert.deepEqual(types(plan(stale, { incubationStaleDays: 7 })), ['incubation.stale']);
  assert.deepEqual(types(plan(stale, { incubationStaleDays: 12 })), []);
  const fresh = emptyFarm({ incubations: [inc(addDays(TODAY, -10), { updatedAt: `${addDays(TODAY, -2)}T12:00:00.000Z` })] });
  assert.deepEqual(types(plan(fresh, { incubationStaleDays: 7 })), []);
});

test('tareas: próximas dentro de la anticipación, vencidas siempre; la salud se separa y aclara que no es veterinaria', () => {
  const task = (id: string, title: string, nextDue: string) => ({ id, title, coopId: 'c1', frequencyDays: 7, lastDone: '', nextDue, status: 'Pendiente', supplies: 0, notes: '' });
  const farm = emptyFarm({ maintenance: [task('m1', 'Cambiar viruta', addDays(TODAY, 1)), task('m2', 'Vacuna Newcastle', addDays(TODAY, 2)), task('m3', 'Limpiar bebederos', addDays(TODAY, -3)), task('m4', 'Desparasitación', addDays(TODAY, -1)), task('m5', 'Lejana', addDays(TODAY, 20)), { ...task('m6', 'Hecha', addDays(TODAY, -5)), status: 'Completada' }] });
  assert.deepEqual(types(plan(farm, { taskLeadDays: 2 })), ['health.due_soon', 'health.overdue', 'maintenance.due_soon', 'maintenance.overdue']);
  assert.deepEqual(types(plan(farm, { taskLeadDays: 0 })), ['health.overdue', 'maintenance.overdue']);
});

test('existencia baja: un aviso por episodio y se rearma tras una nueva compra', () => {
  const stock = [{ id: 's1', product: 'Concentrado', category: 'Alimento', quantity: 5, unit: 'kg', minimum: 10 }];
  const buy = (date: string) => ({ id: `mv-${date}`, stockId: 's1', date, kind: 'Compra' as const, quantity: 40, coopId: '', notes: '' });
  const first = plan(emptyFarm({ stock, movements: [buy('2026-09-01')] }))[0];
  assert.equal(first.type, 'stock.low');
  assert.equal(plan(emptyFarm({ stock, movements: [buy('2026-09-01')] }), {}, new Date(NOW.getTime() + 86_400_000))[0].dedupeKey, first.dedupeKey); // mismo episodio
  assert.notEqual(plan(emptyFarm({ stock, movements: [buy('2026-09-01'), buy('2026-10-05')] }))[0].dedupeKey, first.dedupeKey); // tras reponer y volver a bajar
  assert.deepEqual(types(plan(emptyFarm({ stock: [{ ...stock[0], quantity: 11 }] }))), []);
});

test('la fecha de hoy se calcula en la zona del usuario', () => {
  const farm = emptyFarm({ incubations: [inc('2026-09-23')] }); // estimada 2026-10-14
  const lateNight = new Date('2026-10-15T03:00:00.000Z'); // 22:00 del 14 en Bogotá, ya 15 en Madrid
  assert.deepEqual(types(plan(farm, { timeZone: 'America/Bogota' }, lateNight)), ['incubation.hatch_today']);
  assert.equal(dateInZone(lateNight, 'Europe/Madrid'), '2026-10-15');
  assert.deepEqual(types(plan(farm, { timeZone: 'Europe/Madrid', incubationMarginDays: 5 }, lateNight)), []); // ya pasó un día; sin margen vencido ni aviso de hoy
});

test('operaciones que esperan la acción del usuario más de 48 h', () => {
  const op = (status: string, hours: number) => ({ id: `op-${status}`, listingId: 'l', birdId: 'b', sellerId: 'u1', buyerId: 'u2', origin: 'directa', price: 1, status, shareContact: { seller: false, buyer: false }, history: [], createdAt: '', updatedAt: new Date(NOW.getTime() - hours * 3_600_000).toISOString(), version: 1 }) as never;
  const result = planReminders({ farm: emptyFarm(), prefs: defaultPreferences('u1'), now: NOW, userId: 'u1', operations: [op('solicitud_recibida', 50), op('pago_registrado', 10), op('pago_pendiente', 100), op('entrega_confirmada', 100)] });
  assert.deepEqual(result.map(r => r.dedupeKey), ['opattn:op-solicitud_recibida:solicitud_recibida']); // entrega_confirmada espera al comprador (u2), no a u1
});

async function userWithFarm(env: TestEnv, farm: Record<string, unknown>) {
  const id = await env.addUser('Ana');
  await env.saveFarm(id, farm);
  return id;
}

test('el escaneo genera notificaciones una sola vez por evento sin cambios y avisa de nuevo si cambia la fecha', async () => {
  const env = await makeEnv();
  try {
    const ana = await userWithFarm(env, { birds: [bird({ id: 'hen1', name: 'Luna' })], incubations: [inc(addDays(TODAY, -19), { updatedAt: NOW.toISOString() })] });
    await scanReminders(env.store, ana, NOW); await scanReminders(env.store, ana, NOW);
    const first = await notes(env, ana, 'incubation.hatch_approaching');
    assert.equal(first.length, 1);
    assert.match(first[0].body, /estimación/); assert.doesNotMatch(first[0].body + first[0].title, /nació|nacieron|nacimiento confirmado/i);
    assert.equal(first[0].category, 'incubacion');
    await scanReminders(env.store, ana, new Date(NOW.getTime() + 3_600_000));
    assert.equal((await notes(env, ana, 'incubation.hatch_approaching')).length, 1); // sin cambios: no se repite
    const farm = await env.farm(ana);
    await env.saveFarm(ana, { incubations: (farm.incubations as { id: string }[]).map(item => ({ ...item, hatchAdjustmentDays: 1 })) }); // cambia la fecha estimada
    await scanReminders(env.store, ana, NOW);
    assert.equal((await notes(env, ana, 'incubation.hatch_approaching')).length, 2); // fecha nueva = aviso nuevo
  } finally { await env.cleanup(); }
});

test('"nacimiento confirmado" solo aparece al registrar el nacimiento, nunca por llegar la fecha', async () => {
  const env = await makeEnv();
  try {
    const ana = await userWithFarm(env, { birds: [bird({ id: 'hen1', name: 'Luna' })], incubations: [inc(addDays(TODAY, -21))] });
    await scanReminders(env.store, ana, NOW);
    assert.equal((await notes(env, ana, 'incubation.hatch_today')).length, 1);
    assert.equal((await notes(env, ana, 'birth.recorded')).length, 0);
    const farm = await env.farm(ana);
    await env.saveFarm(ana, { births: [{ id: 'b1', incubationId: 'inc1', date: TODAY, count: 4, motherId: 'hen1', fatherId: '', coopId: 'c1', breed: 'Criolla', notes: '' }], incubations: (farm.incubations as { id: string }[]).map(item => ({ ...item, status: 'Finalizada', hatched: 4, removed: 1 })) });
    const [birth] = await notes(env, ana, 'birth.recorded');
    assert.equal(birth.title, 'Nacimiento confirmado'); assert.match(birth.body, /4 pollitos de Luna/);
    assert.match((await notes(env, ana, 'incubation.unhatched'))[0].body, /4 no eclosionaron o se retiraron/); // 8 huevos: 4 nacidos, 1 retirado y 3 sin eclosionar
  } finally { await env.cleanup(); }
});

test('los cambios de la granja generan mortalidad, interrupción y variación de existencias', async () => {
  const env = await makeEnv();
  try {
    const ana = await userWithFarm(env, { birds: [bird({ id: 'hen1', name: 'Luna' })], incubations: [inc(addDays(TODAY, -5))], stock: [{ id: 's1', product: 'Concentrado', category: 'Alimento', quantity: 40, unit: 'kg', minimum: 5 }] });
    const farm = await env.farm(ana);
    await env.saveFarm(ana, {
      birds: (farm.birds as { id: string }[]).map(item => ({ ...item, status: 'Fallecido' })),
      incubations: (farm.incubations as { id: string }[]).map(item => ({ ...item, status: 'Interrumpida' })),
      stock: (farm.stock as { id: string }[]).map(item => ({ ...item, quantity: 15 })),
    });
    assert.match((await notes(env, ana, 'bird.deceased'))[0].body, /Luna/);
    assert.equal((await notes(env, ana, 'incubation.interrupted')).length, 1);
    assert.match((await notes(env, ana, 'stock.variation'))[0].body, /de 40 a 15 kg/);
    await env.saveFarm(ana, { notes: 'sin cambios relevantes' });
    assert.equal((await notes(env, ana, 'bird.deceased')).length, 1);
  } finally { await env.cleanup(); }
});

test('el servidor marca cuándo se actualizó cada incubación; solo cambia la que se modificó', async () => {
  const env = await makeEnv();
  try {
    const ana = await userWithFarm(env, { incubations: [inc('2026-10-01', { id: 'a' }), inc('2026-10-02', { id: 'b' })] });
    const first = (await env.farm(ana)).incubations as { id: string; updatedAt: string }[];
    assert.equal(first[0].updatedAt, env.now.toISOString());
    const later = new Date('2026-10-20T10:00:00.000Z');
    await env.store.tx(async tx => { const f = (await tx.farms.get(ana))!; await applyFarmSave(tx, ana, { data: { ...f.data, incubations: first.map(item => item.id === 'b' ? { ...item, eggs: 9 } : item) }, version: f.version }, later); });
    const second = (await env.farm(ana)).incubations as { id: string; updatedAt: string }[];
    assert.equal(second.find(item => item.id === 'a')?.updatedAt, env.now.toISOString());
    assert.equal(second.find(item => item.id === 'b')?.updatedAt, later.toISOString());
  } finally { await env.cleanup(); }
});

test('los avisos van solo al dueño de los datos y respetan categorías desactivadas', async () => {
  const env = await makeEnv();
  try {
    const ana = await userWithFarm(env, { stock: [{ id: 's1', product: 'Maíz', category: 'Alimento', quantity: 1, unit: 'kg', minimum: 5 }] });
    const beto = await env.addUser('Beto');
    await scanAllReminders(env.store, NOW);
    assert.equal((await notes(env, ana, 'stock.low')).length, 1);
    assert.equal((await notes(env, beto)).length, 0);
    const carla = await userWithFarm2(env);
    await env.store.tx(tx => updatePreferences(tx, carla, { categories: { inventario: false } }, NOW));
    await scanReminders(env.store, carla, NOW);
    assert.equal((await notes(env, carla)).length, 0);
  } finally { await env.cleanup(); }
});
async function userWithFarm2(env: TestEnv) {
  const id = await env.addUser('Carla');
  await env.saveFarm(id, { stock: [{ id: 's9', product: 'Maíz', category: 'Alimento', quantity: 1, unit: 'kg', minimum: 5 }] });
  return id;
}

test('un conflicto de versión al guardar genera un aviso de sincronización', async () => {
  const env = await makeEnv();
  try {
    const { recordSyncConflict } = await import('../src/features/notifications/service/reminders.ts');
    const ana = await env.addUser('Ana');
    await recordSyncConflict(env.store, ana, NOW); await recordSyncConflict(env.store, ana, NOW);
    assert.equal((await notes(env, ana, 'system.sync_conflict')).length, 1);
  } finally { await env.cleanup(); }
});

test('horario de silencio: cruza medianoche, usa la zona de la persona y calcula cuándo entregar', () => {
  const prefs = { quietHours: { enabled: true, start: '22:00', end: '06:00' }, timeZone: 'America/Bogota' };
  assert.equal(isQuietNow(prefs, new Date('2026-10-15T03:30:00.000Z')), true);   // 22:30 en Bogotá
  assert.equal(isQuietNow(prefs, new Date('2026-10-15T09:00:00.000Z')), true);   // 04:00: sigue el silencio hasta las 06:00
  assert.equal(isQuietNow(prefs, new Date('2026-10-15T11:00:00.000Z')), false);  // 06:00 en punto ya no
  assert.equal(isQuietNow(prefs, new Date('2026-10-15T12:00:00.000Z')), false);  // 07:00
  assert.equal(isQuietNow({ ...prefs, quietHours: { ...prefs.quietHours, enabled: false } }, new Date('2026-10-15T03:30:00.000Z')), false);
  assert.equal(nextDeliveryTime(prefs, new Date('2026-10-15T03:30:00.000Z')).toISOString(), '2026-10-15T11:00:00.000Z'); // 06:00 Bogotá del día siguiente
  assert.equal(nextDeliveryTime(prefs, new Date('2026-10-15T09:00:00.000Z')).toISOString(), '2026-10-15T11:00:00.000Z'); // madrugada: ese mismo día a las 06:00
  const awake = new Date('2026-10-15T15:00:00.000Z');
  assert.equal(nextDeliveryTime(prefs, awake).getTime(), awake.getTime());
  const sameDay = { quietHours: { enabled: true, start: '13:00', end: '15:00' }, timeZone: 'America/Bogota' };
  assert.equal(isQuietNow(sameDay, new Date('2026-10-15T19:00:00.000Z')), true);
  assert.equal(isQuietNow(sameDay, new Date('2026-10-15T21:00:00.000Z')), false);
});
