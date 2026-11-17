import { randomUUID } from 'node:crypto';
import type { ChickLot, CustomProduct, FarmData, FertileEggLot } from '../../../models/farm.ts';
import { ConflictError, ForbiddenError, ValidationError } from '../../../server/errors.ts';
import type { ItemType, ListingItem, ListingRecord, ListingStatus, Tx } from '../../../server/storage/types.ts';
import { BLOCKED_BIRD_STATUS, findBird } from './snapshot.ts';
import type { FarmJson } from './snapshot.ts';

export const ACTIVE_STATUSES: ListingStatus[] = ['borrador', 'publicada', 'pausada', 'en_operacion'];
/** Estados en los que la publicación ya tiene bloqueos activos. */
export const LOCKED_STATUSES: ListingStatus[] = ['publicada', 'pausada', 'en_operacion'];
export const MAX_BIRDS_PER_LOT = 50;
const ITEM_TYPES: ItemType[] = ['ave', 'lote_aves', 'lote_pollitos', 'lote_huevos', 'insumo'];

type Shape = Pick<ListingRecord, 'birdId'> & Partial<Pick<ListingRecord, 'itemType' | 'items'>>;
export const itemTypeOf = (listing: Pick<ListingRecord, 'itemType'>): ItemType => listing.itemType ?? 'ave';
export const itemsOf = (listing: Shape): ListingItem[] => listing.items ?? [{ type: 'ave', birdId: listing.birdId }];
/** Clave de recurso que va en `birdId`: el id del ave, o `lote:<id de la publicación>`. */
export const resourceKeyOf = (type: ItemType, items: ListingItem[], listingId: string): string => (type === 'ave' ? (items[0] as { birdId: string }).birdId : `lote:${listingId}`);

export interface ItemsInput { itemType?: unknown; birdId?: unknown; birdIds?: unknown; lotId?: unknown; quantity?: unknown; }

export function parseItems(input: ItemsInput): { itemType: ItemType; items: ListingItem[] } {
  const itemType = (input.itemType ?? 'ave') as ItemType;
  if (!ITEM_TYPES.includes(itemType)) throw new ValidationError('Tipo de publicación no válido.');
  if (itemType === 'ave') {
    if (typeof input.birdId !== 'string' || !input.birdId) throw new ValidationError('Selecciona un ave.');
    return { itemType, items: [{ type: 'ave', birdId: input.birdId }] };
  }
  if (itemType === 'lote_aves') {
    const ids = input.birdIds;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id)) throw new ValidationError('Selecciona las aves del lote.');
    const unique = [...new Set(ids as string[])];
    if (unique.length !== ids.length) throw new ValidationError('Hay aves repetidas en el lote.');
    if (unique.length < 2) throw new ValidationError('Un lote de aves necesita al menos 2 aves. Para una sola ave usa «Un ave».');
    if (unique.length > MAX_BIRDS_PER_LOT) throw new ValidationError(`Un lote de aves admite como máximo ${MAX_BIRDS_PER_LOT} aves.`);
    return { itemType, items: unique.map(birdId => ({ type: 'ave' as const, birdId })) };
  }
  if (typeof input.lotId !== 'string' || !input.lotId) throw new ValidationError('Selecciona el lote.');
  const quantity = input.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) throw new ValidationError('La cantidad debe ser un número entero mayor que 0.');
  return { itemType, items: [{ type: itemType, lotId: input.lotId, quantity }] };
}

/** Fuente de un lote o insumo: lote de pollitos, lote de huevos o producto de la granja (cuido, maíz, equipos…). */
export function findLot(data: FarmJson, type: 'lote_pollitos' | 'lote_huevos' | 'insumo', lotId: string): ChickLot | FertileEggLot | CustomProduct | undefined {
  const farm = data as unknown as FarmData;
  if (type === 'insumo') return farm.customProducts?.find(product => product.id === lotId);
  return type === 'lote_pollitos' ? farm.chickLots?.find(lot => lot.id === lotId) : farm.fertileLots?.find(lot => lot.id === lotId);
}

/** Unidades de un lote ya comprometidas por publicaciones con bloqueo activo. */
export async function reservedOf(tx: Tx, lotId: string, exceptListingId?: string): Promise<number> {
  return (await tx.locks.list({ lotId, status: 'active' })).filter(lock => lock.listingId !== exceptListingId).reduce((sum, lock) => sum + (lock.quantity ?? 0), 0);
}

/** Comprueba la propiedad registrada de un ave; si aún no figura en el registro, la inscribe a nombre del usuario. */
export async function assertOwnsBird(tx: Tx, userId: string, farmData: FarmJson, birdId: string, now: Date) {
  if (!findBird(farmData, birdId)) throw new ForbiddenError('Solo puedes publicar aves de tu propia granja.');
  const registered = await tx.ownership.get(birdId);
  if (registered && registered.ownerId !== userId) throw new ForbiddenError('Solo puedes publicar aves de tu propia granja.');
  if (!registered) {
    const at = now.toISOString();
    await tx.ownership.insert({ id: birdId, ownerId: userId, since: at, version: 1 });
    await tx.ownershipHistory.insert({ id: `${birdId}:${at}`, birdId, ownerId: userId, from: at });
  }
}

async function usedByOtherListing(tx: Tx, sellerId: string, birdId: string, exceptListingId: string): Promise<boolean> {
  return (await tx.listings.list({ sellerId })).some(row => row.id !== exceptListingId && ACTIVE_STATUSES.includes(row.status) && itemsOf(row).some(item => item.type === 'ave' && item.birdId === birdId));
}

/**
 * Valida en el servidor que cada fuente (ave o lote) es del vendedor y está disponible.
 * `create` valida al crear el borrador; `publish` revalida al bloquear y publica (los errores son de conflicto).
 */
export async function assertSources(tx: Tx, userId: string, data: FarmJson, itemType: ItemType, items: ListingItem[], listingId: string, now: Date, mode: 'create' | 'publish'): Promise<void> {
  for (const item of items) {
    if (item.type === 'ave') {
      if (mode === 'create') await assertOwnsBird(tx, userId, data, item.birdId, now);
      const bird = findBird(data, item.birdId);
      if (!bird) throw new ConflictError('El ave ya no existe en tu granja.');
      if (BLOCKED_BIRD_STATUS.includes(bird.status)) throw new ConflictError(`El ave está ${bird.status.toLowerCase()} y no se puede publicar.`);
      if (mode === 'create' && await usedByOtherListing(tx, userId, item.birdId, listingId)) throw new ConflictError(itemType === 'ave' ? 'Esta ave ya tiene una publicación. Edítala o retírala primero.' : `«${bird.name}» ya tiene una publicación. Retírala antes de incluirla en un lote.`);
      if (mode === 'publish' && (await tx.locks.list({ birdId: item.birdId, status: 'active' })).length) throw new ConflictError('Esta ave ya tiene una publicación activa o una operación pendiente.');
      continue;
    }
    const lot = findLot(data, item.type, item.lotId);
    if (!lot) throw mode === 'create' ? new ForbiddenError('Solo puedes publicar lotes de tu propia granja.') : new ConflictError('El lote ya no existe en tu granja.');
    const free = lot.available - await reservedOf(tx, item.lotId, listingId);
    if (item.quantity > free) throw new ConflictError(`Solo quedan ${Math.max(free, 0)} unidades disponibles en ese lote.`);
  }
}

export async function createLocks(tx: Tx, listing: ListingRecord, now: Date): Promise<void> {
  const createdAt = now.toISOString();
  for (const item of itemsOf(listing)) {
    if (item.type === 'ave') await tx.locks.insert({ id: randomUUID(), birdId: item.birdId, listingId: listing.id, status: 'active', createdAt });
    else await tx.locks.insert({ id: randomUUID(), birdId: listing.birdId, listingId: listing.id, lotId: item.lotId, quantity: item.quantity, status: 'active', createdAt });
  }
}
