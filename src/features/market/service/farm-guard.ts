import { ConflictError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { Tx } from '../../../server/storage/types.ts';
import type { FarmData } from '../../../models/farm.ts';
import { diffFarmEvents, emitPlans, stampIncubations } from '../../notifications/service/reminders.ts';
import { flagListingsForReview } from './listings.ts';
import { LOCKED_STATUSES, itemsOf } from './items.ts';

type Json = Record<string, unknown>;
const BLOCKED_WHILE_LOCKED = ['Vendido', 'Fallecido'];

function birdsOf(data: Json): Json[] {
  return Array.isArray(data.birds) ? (data.birds as Json[]) : [];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Reglas de propiedad al guardar la granja. Se ejecuta dentro de la transacción de guardado.
export async function guardFarmSave(tx: Tx, userId: string, previous: Json, next: Json, now: Date): Promise<void> {
  const before = new Map(birdsOf(previous).map(bird => [String(bird.id), bird]));
  const seen = new Set<string>();
  const owned = new Set((await tx.ownership.list({ ownerId: userId })).map(row => row.id));

  for (const bird of birdsOf(next)) {
    const id = typeof bird.id === 'string' ? bird.id : '';
    if (!id || id.length > 120) throw new ValidationError('Cada ave necesita un identificador válido.');
    if (seen.has(id)) throw new ValidationError('Hay dos aves con el mismo identificador.');
    seen.add(id);
    const prior = before.get(id);

    if (prior?.status === 'Transferido') {
      if (!same(prior, bird)) throw new ConflictError('Un ave transferida es historial y no se puede modificar.');
      continue;
    }
    if (bird.status === 'Transferido') throw new ConflictError('El estado "Transferido" solo lo asigna el sistema al completar una operación.');

    if (!owned.has(id)) {
      const registered = await tx.ownership.get(id);
      if (registered && registered.ownerId !== userId) throw new ConflictError('Esta ave ya está registrada en otra cuenta.');
      if (!registered) {
        const at = now.toISOString();
        await tx.ownership.insert({ id, ownerId: userId, since: at, version: 1 });
        await tx.ownershipHistory.insert({ id: `${id}:${at}`, birdId: id, ownerId: userId, from: at });
      }
    }

    if (prior && BLOCKED_WHILE_LOCKED.includes(String(bird.status)) && prior.status !== bird.status) {
      const locks = await tx.locks.list({ birdId: id, status: 'active' });
      if (locks.length) throw new ConflictError(`"${String(bird.name)}" está en el mercado. Retira la publicación antes de marcarla como ${String(bird.status).toLowerCase()}.`);
    }
  }

  for (const [id, prior] of before) {
    if (seen.has(id)) continue;
    if (prior.status === 'Transferido') throw new ConflictError('Un ave transferida es historial y no se puede eliminar.');
    if ((await tx.locks.list({ birdId: id, status: 'active' })).length) throw new ConflictError(`"${String(prior.name)}" está en el mercado. Retira la publicación antes de eliminarla.`);
  }

  // Lotes con unidades reservadas en el mercado: no se pueden eliminar ni dejar con menos disponibles que lo reservado.
  const reserved = new Map<string, number>();
  for (const listing of await tx.listings.list({ sellerId: userId })) {
    if (!LOCKED_STATUSES.includes(listing.status)) continue;
    for (const item of itemsOf(listing)) if (item.type !== 'ave') reserved.set(item.lotId, (reserved.get(item.lotId) ?? 0) + item.quantity);
  }
  if (reserved.size) {
    const farm = next as unknown as FarmData;
    const lots: { id: string; code: string; available: number }[] = [...(farm.chickLots ?? []), ...(farm.fertileLots ?? []), ...(farm.customProducts ?? [])];
    for (const [lotId, quantity] of reserved) {
      const lot = lots.find(item => item.id === lotId);
      if (!lot) throw new ConflictError('Un lote reservado en el mercado no se puede eliminar. Retira la publicación antes.');
      if (lot.available < quantity) throw new ConflictError(`El lote ${lot.code} tiene ${quantity} unidades en el mercado: no puedes dejar menos disponibles. Retira la publicación antes.`);
    }
  }
}

export async function applyFarmSave(tx: Tx, userId: string, input: { data: Json; version: number }, now: Date): Promise<{ version: number }> {
  const farm = await tx.farms.get(userId);
  if (!farm) throw new NotFoundError('No existe el espacio de granja de esta cuenta.');
  if (farm.version !== input.version) throw new ConflictError('Los datos cambiaron en otra sesión. Recarga la granja antes de guardar para evitar sobrescribir cambios.');
  await guardFarmSave(tx, userId, farm.data, input.data, now);
  await flagListingsForReview(tx, userId, input.data, now);
  const version = farm.version + 1;
  stampIncubations(farm.data as unknown as FarmData, input.data as unknown as FarmData, now);
  await emitPlans(tx, diffFarmEvents(farm.data as unknown as FarmData, input.data as unknown as FarmData, userId, version), now);
  await tx.farms.update({ ...farm, data: input.data, version, updatedAt: now.toISOString() });
  return { version };
}
