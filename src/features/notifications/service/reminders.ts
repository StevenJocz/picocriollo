import type { FarmData, Incubation } from '../../../models/farm.ts';
import type { OperationRecord, PreferencesRecord, Store, Tx } from '../../../server/storage/types.ts';
import { addDays, dateInZone, daysBetween } from '../../../shared/time.ts';
import { INCUBATION_DAYS } from '../../farm/service/rules.ts';
import { emit } from './events.ts';
import { getPreferences } from './preferences.ts';

export interface ReminderPlan { type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; dedupeKey: string; }

/** Días de incubación por tipo. Natural y artificial duran lo mismo en gallinas; se separan para poder ajustarlos. */
export const HATCH_DAYS: Record<'Natural' | 'Artificial', number> = { Natural: INCUBATION_DAYS, Artificial: INCUBATION_DAYS };
const HEALTH_WORDS = /vacun|desparasit|vitamin|veterin|tratamiento|dosis|sanitar|antibi|control|enfermed|cuarentena/i;
const ATTENTION_HOURS = 48;

/** Fecha estimada de eclosión = inicio + días del tipo + ajuste. Es una estimación, no un nacimiento. */
export function estimatedHatch(incubation: Pick<Incubation, 'startedAt' | 'type' | 'hatchAdjustmentDays'>): string {
  return addDays(incubation.startedAt, HATCH_DAYS[incubation.type ?? 'Natural'] + Number(incubation.hatchAdjustmentDays || 0));
}

const name = (farm: FarmData, id: string) => farm.birds.find(bird => bird.id === id)?.name;
const incubationLabel = (farm: FarmData, inc: Incubation) => (inc.type === 'Artificial' ? (inc.equipment || 'Incubadora') : `Clueca ${name(farm, inc.henId) ?? 'sin nombre'}`);

/** Recordatorios derivados del estado actual de la granja. Función pura: la misma entrada da el mismo plan. */
export function planReminders(input: { farm: FarmData; prefs: PreferencesRecord; now: Date; userId: string; operations?: OperationRecord[] }): ReminderPlan[] {
  const { farm, prefs, now, userId } = input;
  const today = dateInZone(now, prefs.timeZone);
  const plans: ReminderPlan[] = [];
  const add = (type: string, aggregateType: string, aggregateId: string, dedupeKey: string, payload: Record<string, unknown>) => plans.push({ type, aggregateType, aggregateId, dedupeKey, payload: { userId, ...payload } });

  for (const inc of farm.incubations ?? []) {
    if (inc.status !== 'En curso') continue;
    const estimated = estimatedHatch(inc), left = daysBetween(today, estimated), label = incubationLabel(farm, inc);
    const hasBirth = (farm.births ?? []).some(birth => birth.incubationId === inc.id);
    if (left > 0 && left <= prefs.incubationLeadDays) add('incubation.hatch_approaching', 'incubation', inc.id, `inc:${inc.id}:approaching:${estimated}`, { label, estimated, left });
    if (left === 0) add('incubation.hatch_today', 'incubation', inc.id, `inc:${inc.id}:today:${estimated}`, { label, estimated });
    if (left < -prefs.incubationMarginDays && !hasBirth) add('incubation.overdue', 'incubation', inc.id, `inc:${inc.id}:overdue:${estimated}`, { label, estimated, late: -left });
    const touched = (inc.updatedAt ?? '').slice(0, 10) || inc.startedAt;
    if (daysBetween(touched, today) >= prefs.incubationStaleDays) add('incubation.stale', 'incubation', inc.id, `inc:${inc.id}:stale:${touched}`, { label, days: daysBetween(touched, today) });
  }

  for (const task of farm.maintenance ?? []) {
    if (task.status === 'Completada' || !task.nextDue) continue;
    const left = daysBetween(today, task.nextDue), health = HEALTH_WORDS.test(task.title);
    if (left < 0) add(health ? 'health.overdue' : 'maintenance.overdue', 'maintenance', task.id, `maint:${task.id}:overdue:${task.nextDue}`, { title: task.title, due: task.nextDue, late: -left });
    else if (left <= prefs.taskLeadDays) add(health ? 'health.due_soon' : 'maintenance.due_soon', 'maintenance', task.id, `maint:${task.id}:soon:${task.nextDue}`, { title: task.title, due: task.nextDue, left });
  }

  for (const group of farm.breedingGroups ?? []) {
    if (group.status !== 'Activo' || !group.endedAt) continue;
    const left = daysBetween(today, group.endedAt);
    if (left >= 0 && left <= prefs.taskLeadDays) add('breeding.review_due', 'breeding', group.id, `breed:${group.id}:review:${group.endedAt}`, { name: group.name, date: group.endedAt, left });
  }

  for (const item of farm.stock ?? []) {
    if (item.quantity > item.minimum) continue;
    // Se vuelve a avisar solo después de una nueva compra (reposición): misma existencia baja = mismo aviso.
    const lastRestock = (farm.movements ?? []).filter(move => move.stockId === item.id && move.kind === 'Compra').map(move => move.date).sort().at(-1) ?? 'sin-compras';
    add('stock.low', 'stock', item.id, `stock:${item.id}:low:${lastRestock}`, { product: item.product, quantity: item.quantity, unit: item.unit, minimum: item.minimum });
  }

  for (const op of input.operations ?? []) {
    const waitingFor = op.status === 'solicitud_recibida' || op.status === 'pago_registrado' ? op.sellerId : op.status === 'entrega_confirmada' ? op.buyerId : undefined;
    if (waitingFor !== userId) continue;
    const hours = (now.getTime() - new Date(op.updatedAt).getTime()) / 3_600_000;
    if (hours >= ATTENTION_HOURS) add('operation.needs_attention', 'operation', op.id, `opattn:${op.id}:${op.status}`, { operationId: op.id, status: op.status, days: Math.floor(hours / 24) });
  }
  return plans;
}

type Rows<T> = T[] | undefined;
const byId = <T extends { id: string }>(rows: Rows<T>) => new Map((rows ?? []).map(row => [row.id, row]));

/** Eventos por cambios entre dos versiones de la granja (nacimientos, incidencias de incubación, bajas, existencias). */
export function diffFarmEvents(previous: FarmData, next: FarmData, userId: string, version: number): ReminderPlan[] {
  const plans: ReminderPlan[] = [];
  const add = (type: string, aggregateType: string, aggregateId: string, dedupeKey: string, payload: Record<string, unknown>) => plans.push({ type, aggregateType, aggregateId, dedupeKey, payload: { userId, ...payload } });

  const births = byId(previous.births);
  for (const birth of next.births ?? []) {
    if (births.has(birth.id)) continue;
    add('birth.recorded', 'birth', birth.id, `birth:${birth.id}`, { count: birth.count, mother: name(next, birth.motherId) ?? '', date: birth.date });
  }
  const incubations = byId(previous.incubations);
  for (const inc of next.incubations ?? []) {
    const before = incubations.get(inc.id);
    if (!before || before.status === inc.status) continue;
    const unhatched = Math.max(0, inc.eggs - inc.hatched - inc.removed);
    if (inc.status === 'Finalizada' && (unhatched > 0 || inc.removed > 0)) add('incubation.unhatched', 'incubation', inc.id, `inc:${inc.id}:unhatched:${inc.hatched}:${inc.removed}`, { label: incubationLabel(next, inc), eggs: inc.eggs, hatched: inc.hatched, unhatched: unhatched + inc.removed });
    if (inc.status === 'Interrumpida') add('incubation.interrupted', 'incubation', inc.id, `inc:${inc.id}:interrupted`, { label: incubationLabel(next, inc) });
  }
  const birds = byId(previous.birds);
  for (const bird of next.birds ?? []) {
    const before = birds.get(bird.id);
    if (before && before.status !== 'Fallecido' && bird.status === 'Fallecido') add('bird.deceased', 'bird', bird.id, `death:${bird.id}`, { name: bird.name, code: bird.code ?? '' });
  }
  const stock = byId(previous.stock);
  for (const item of next.stock ?? []) {
    const before = stock.get(item.id);
    if (!before || before.quantity <= 0) continue;
    const change = Math.abs(item.quantity - before.quantity) / before.quantity;
    if (change >= 0.5) add('stock.variation', 'stock', item.id, `stockvar:${item.id}:${version}`, { product: item.product, from: before.quantity, to: item.quantity, unit: item.unit });
  }
  return plans;
}

/** El servidor marca cuándo cambió cada incubación por última vez (para detectar las que no se actualizan). */
export function stampIncubations(previous: FarmData, next: FarmData, now: Date) {
  const before = byId(previous.incubations);
  for (const inc of next.incubations ?? []) {
    const old = before.get(inc.id);
    const unchanged = old && JSON.stringify({ ...old, updatedAt: undefined }) === JSON.stringify({ ...inc, updatedAt: undefined });
    inc.updatedAt = unchanged ? (old.updatedAt ?? inc.updatedAt) : now.toISOString();
    if (!inc.updatedAt) delete inc.updatedAt;
  }
}

export async function emitPlans(tx: Tx, plans: ReminderPlan[], now: Date): Promise<number> {
  let created = 0;
  for (const plan of plans) if (await emit(tx, { type: plan.type, aggregateType: plan.aggregateType, aggregateId: plan.aggregateId, payload: plan.payload, dedupeKey: `${plan.dedupeKey}:${String(plan.payload.userId)}`, now })) created++;
  return created;
}

export async function scanReminders(store: Store, userId: string, now: Date): Promise<{ emitted: number }> {
  return store.tx(async tx => {
    const farm = await tx.farms.get(userId);
    if (!farm) return { emitted: 0 };
    const prefs = await getPreferences(tx, userId, now);
    const mine = [...(await tx.operations.list({ sellerId: userId })), ...(await tx.operations.list({ buyerId: userId }))];
    const plans = planReminders({ farm: farm.data as unknown as FarmData, prefs, now, userId, operations: mine });
    return { emitted: await emitPlans(tx, plans, now) };
  });
}

export async function scanAllReminders(store: Store, now: Date): Promise<{ users: number; emitted: number }> {
  const ids = await store.tx(async tx => (await tx.farms.list()).map(farm => farm.id));
  let emitted = 0;
  for (const id of ids) emitted += (await scanReminders(store, id, now)).emitted;
  return { users: ids.length, emitted };
}

/** Registra que se evitó sobrescribir datos (conflicto de versión). Va en su propia transacción: la de guardado se revirtió. */
export async function recordSyncConflict(store: Store, userId: string, now: Date): Promise<void> {
  await store.tx(async tx => {
    const farm = await tx.farms.get(userId);
    await emit(tx, { type: 'system.sync_conflict', aggregateType: 'farm', aggregateId: userId, payload: { userId }, dedupeKey: `sync:${userId}:${farm?.version ?? 0}`, now });
  });
}
