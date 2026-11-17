import { createHash } from 'node:crypto';
import type { Bird, ChickLot, CustomProduct, FarmData, FertileEggLot } from '../../../models/farm.ts';
import { ValidationError } from '../../../server/errors.ts';
import { speciesOf } from '../../../models/species.ts';
import type { Ancestor, ItemType, ListingConsent, ListingItem, PublicSnapshot, UserRecord } from '../../../server/storage/types.ts';

export type FarmJson = Record<string, unknown>;
const farmOf = (data: FarmJson) => data as unknown as FarmData;
export const BLOCKED_BIRD_STATUS = ['Vendido', 'Fallecido', 'Transferido'];

export function aliasOf(user: Pick<UserRecord, 'id' | 'displayName'>): string {
  return user.displayName?.trim() || `Criador-${user.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`;
}

export function findBird(data: FarmJson, birdId: string): Bird | undefined {
  return farmOf(data).birds?.find(bird => bird.id === birdId);
}
export function currentRing(data: FarmJson, birdId: string): number | null {
  return farmOf(data).rings?.find(ring => ring.birdId === birdId && ring.status === 'Asignado' && !ring.endedAt)?.number ?? null;
}

function ancestor(data: FarmJson, id: string, depth: number): Ancestor | undefined {
  if (!id) return undefined;
  const bird = findBird(data, id);
  if (!bird) return undefined;
  const found: Ancestor = { name: bird.name, code: bird.code ?? '', breed: bird.breed, sex: bird.sex, species: speciesOf(bird.species) };
  if (depth > 1) {
    const mother = ancestor(data, bird.motherId, depth - 1), father = ancestor(data, bird.fatherId, depth - 1);
    if (mother) found.mother = mother;
    if (father) found.father = father;
  }
  return found;
}

export function ageLabel(bornAt: string, fallback: string | undefined, now: Date): string {
  if (!bornAt) return fallback || 'Edad no registrada';
  const born = new Date(`${bornAt}T12:00:00Z`);
  if (Number.isNaN(born.getTime())) return fallback || 'Edad no registrada';
  const days = Math.max(0, Math.floor((now.getTime() - born.getTime()) / 86_400_000));
  if (days < 45) return `${days} día${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} meses`;
  const years = Math.floor(months / 12), rest = months % 12;
  return rest ? `${years} años y ${rest} meses` : `${years} años`;
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Huella de los datos de la ficha que alimentan una publicación (sin notas privadas). Null si el ave ya no existe. */
export function sourceFingerprint(data: FarmJson, birdId: string): string | null {
  const bird = findBird(data, birdId);
  if (!bird) return null;
  return sha(JSON.stringify({
    name: bird.name, code: bird.code ?? '', sex: bird.sex, breed: bird.breed, bornAt: bird.bornAt, status: bird.status,
    ring: currentRing(data, birdId), photo: sha(bird.photo || ''),
    mother: ancestor(data, bird.motherId, 2) ?? null, father: ancestor(data, bird.fatherId, 2) ?? null,
  }));
}

export function parsePhoto(photo: string): { mime: string; bytes: Uint8Array } | undefined {
  if (!photo) return undefined;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (!match) return undefined;
  const bytes = new Uint8Array(Buffer.from(match[2], 'base64'));
  return bytes.length && bytes.length <= 3 * 1024 * 1024 ? { mime: match[1], bytes } : undefined;
}

export const MAX_PHOTOS = 6, MAX_PHOTOS_TOTAL_BYTES = 12 * 1024 * 1024;

/** Valida el lote de fotos recibido del cliente. Cualquier foto inválida rechaza toda la petición. */
export function parsePhotos(raw: unknown): { mime: string; bytes: Uint8Array }[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ValidationError('Las fotos no son válidas.');
  if (raw.length > MAX_PHOTOS) throw new ValidationError(`Puedes subir como máximo ${MAX_PHOTOS} fotos.`);
  const out: { mime: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const item of raw) {
    const photo = typeof item === 'string' ? parsePhoto(item) : undefined;
    if (!photo) throw new ValidationError('Una foto no es válida: usa JPG, PNG o WEBP de hasta 3 MB.');
    total += photo.bytes.length;
    if (total > MAX_PHOTOS_TOTAL_BYTES) throw new ValidationError('Las fotos superan el tamaño total permitido (12 MB).');
    out.push(photo);
  }
  return out;
}

export const defaultConsent = (): ListingConsent => ({
  description: '', deliveryZone: '', showPhoto: true, showGenealogy: true, showReproduction: false,
  showBreeder: false, breederAlias: '', healthNote: '', shareHistoryReproductive: false, shareHistoryHealth: false,
});

export function normalizeConsent(input: Record<string, unknown> | undefined, base: ListingConsent = defaultConsent()): ListingConsent {
  const out = { ...base };
  const text = (key: 'description' | 'deliveryZone' | 'breederAlias' | 'healthNote', max: number) => {
    const value = input?.[key];
    if (value === undefined) return;
    if (typeof value !== 'string' || value.length > max) throw new ValidationError(`${key} no es válido (máximo ${max} caracteres).`);
    out[key] = value.trim();
  };
  text('description', 1200); text('deliveryZone', 120); text('breederAlias', 60); text('healthNote', 400);
  for (const key of ['showPhoto', 'showGenealogy', 'showReproduction', 'showBreeder', 'shareHistoryReproductive', 'shareHistoryHealth'] as const) {
    const value = input?.[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') throw new ValidationError(`${key} no es válido.`);
    out[key] = value;
  }
  return out;
}

export interface BuiltSnapshot { snapshot: Omit<PublicSnapshot, 'photoId'>; sourceHash: string; photo?: { mime: string; bytes: Uint8Array }; }

/** Construye la vista pública desde la ficha REAL del vendedor. Solo campos de la lista permitida. */
export function buildSnapshot(data: FarmJson, birdId: string, consent: ListingConsent, sellerAlias: string, now: Date): BuiltSnapshot {
  const bird = findBird(data, birdId);
  if (!bird) throw new ValidationError('El ave no existe en la ficha.');
  const farm = farmOf(data);
  const snapshot: BuiltSnapshot['snapshot'] = {
    name: bird.name, code: bird.code ?? '', ring: currentRing(data, birdId), breed: bird.breed, sex: bird.sex, species: speciesOf(bird.species), bornAt: bird.bornAt,
    ageLabel: ageLabel(bird.bornAt, bird.ageEstimate, now), description: consent.description, deliveryZone: consent.deliveryZone,
    declaredBySeller: true,
  };
  if (consent.healthNote) snapshot.healthNote = consent.healthNote;
  if (consent.showBreeder) snapshot.breeder = consent.breederAlias || sellerAlias;
  // El linaje (padres, abuelos y bisabuelos registrados) siempre es público: el comprador lo necesita para decidir. `showGenealogy` queda solo por compatibilidad.
  {
    const mother = ancestor(data, bird.motherId, 3), father = ancestor(data, bird.fatherId, 3);
    if (mother || father) snapshot.genealogy = { ...(mother ? { mother } : {}), ...(father ? { father } : {}) };
  }
  if (consent.showReproduction) {
    snapshot.offspringCount = (farm.births ?? []).filter(birth => birth.motherId === birdId || birth.fatherId === birdId).reduce((sum, birth) => sum + Number(birth.count || 0), 0);
  }
  const fingerprint = sourceFingerprint(data, birdId)!;
  return { snapshot, sourceHash: fingerprint, photo: consent.showPhoto ? parsePhoto(bird.photo) : undefined };
}

function lotIn(data: FarmJson, type: 'lote_pollitos' | 'lote_huevos' | 'insumo', lotId: string): ChickLot | FertileEggLot | CustomProduct | undefined {
  const farm = farmOf(data);
  if (type === 'insumo') return farm.customProducts?.find(product => product.id === lotId);
  return type === 'lote_pollitos' ? farm.chickLots?.find(lot => lot.id === lotId) : farm.fertileLots?.find(lot => lot.id === lotId);
}

/** Misma huella que `sourceFingerprint` para un ave; para lotes, combina las fuentes. Null si alguna ya no existe. */
export function listingFingerprint(data: FarmJson, itemType: ItemType, items: ListingItem[]): string | null {
  if (itemType === 'ave' || itemType === 'lote_aves') {
    const parts = items.map(item => (item.type === 'ave' ? sourceFingerprint(data, item.birdId) : null));
    if (parts.some(part => part === null)) return null;
    return itemType === 'ave' ? parts[0] : sha(JSON.stringify(parts));
  }
  const item = items[0];
  if (item.type === 'ave') return null;
  const lot = lotIn(data, item.type, item.lotId);
  if (!lot) return null;
  return sha(JSON.stringify({ code: lot.code, breed: 'breed' in lot ? lot.breed : lot.category, enough: lot.available >= item.quantity, fertility: 'fertility' in lot ? lot.fertility : null, productType: 'productType' in lot ? lot.productType ?? null : null }));
}

function lotSnapshotBase(consent: ListingConsent, sellerAlias: string): Pick<PublicSnapshot, 'description' | 'deliveryZone' | 'declaredBySeller'> & Partial<Pick<PublicSnapshot, 'healthNote' | 'breeder'>> {
  return {
    description: consent.description, deliveryZone: consent.deliveryZone, declaredBySeller: true,
    ...(consent.healthNote ? { healthNote: consent.healthNote } : {}),
    ...(consent.showBreeder ? { breeder: consent.breederAlias || sellerAlias } : {}),
  };
}

export function buildListingSnapshot(data: FarmJson, itemType: ItemType, items: ListingItem[], consent: ListingConsent, sellerAlias: string, now: Date): BuiltSnapshot {
  if (itemType === 'ave') return buildSnapshot(data, (items[0] as { birdId: string }).birdId, consent, sellerAlias, now);
  const sourceHash = listingFingerprint(data, itemType, items);
  if (sourceHash === null) throw new ValidationError('Una de las fuentes de la publicación ya no existe en la ficha.');
  if (itemType === 'lote_aves') {
    const birds = items.map(item => findBird(data, (item as { birdId: string }).birdId)!);
    const breeds = [...new Set(birds.map(bird => bird.breed))], sexes = [...new Set(birds.map(bird => bird.sex))];
    const kinds = [...new Set(birds.map(bird => speciesOf(bird.species)))];
    const noun = kinds.length === 1 && kinds[0] !== 'Gallinas' ? kinds[0].toLocaleLowerCase('es-CO') : 'aves';
    const title = `Lote de ${birds.length} ${noun}${breeds.length === 1 ? ` ${breeds[0]}` : ''}`;
    return {
      sourceHash,
      snapshot: {
        name: title, title, itemType, quantity: birds.length, code: '', ring: null, breed: breeds.length === 1 ? breeds[0] : 'Mixta', sex: sexes.length === 1 ? sexes[0] : 'Mixto', ...(kinds.length === 1 ? { species: kinds[0] } : {}), bornAt: '', ageLabel: '',
        lotBirds: birds.map(bird => ({ name: bird.name, code: bird.code ?? '', sex: bird.sex, breed: bird.breed, ageLabel: ageLabel(bird.bornAt, bird.ageEstimate, now) })),
        ...lotSnapshotBase(consent, sellerAlias),
      },
    };
  }
  const item = items[0] as { type: 'lote_pollitos' | 'lote_huevos' | 'insumo'; lotId: string; quantity: number };
  const found = lotIn(data, item.type, item.lotId)!;
  if (item.type === 'insumo') {
    const product = found as CustomProduct;
    const title = `${product.name} · ${item.quantity} ${product.unit}`;
    return {
      sourceHash,
      snapshot: { name: title, title, itemType: 'insumo', quantity: item.quantity, code: product.code, ring: null, breed: product.category || 'Insumo', sex: 'No aplica', bornAt: '', ageLabel: '', ...lotSnapshotBase(consent, sellerAlias) },
    };
  }
  const lot = found as ChickLot | FertileEggLot;
  const farm = farmOf(data);
  const unit = item.type === 'lote_pollitos' ? 'pollitos' : (lot as FertileEggLot).productType === 'Huevo consumo' ? 'huevos de consumo' : 'huevos fértiles';
  const title = `Lote de ${item.quantity} ${unit}${lot.breed ? ` ${lot.breed}` : ''}`;
  const bornAt = item.type === 'lote_pollitos' ? farm.births?.find(birth => birth.id === (lot as ChickLot).birthId)?.date ?? '' : '';
  return {
    sourceHash,
    snapshot: {
      name: title, title, itemType: item.type, quantity: item.quantity, code: lot.code, ring: null, breed: lot.breed || 'No registrada', sex: 'Mixto', bornAt,
      ageLabel: bornAt ? ageLabel(bornAt, undefined, now) : '',
      ...(item.type === 'lote_huevos' ? { fertility: (lot as FertileEggLot).fertility } : {}),
      ...lotSnapshotBase(consent, sellerAlias),
    },
  };
}
