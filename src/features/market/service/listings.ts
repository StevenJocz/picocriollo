import { proximityBucket } from '../../profile/service/location.ts';
import { SPECIES_LABELS, speciesOf } from '../../../models/species.ts';
import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { VideoTranscoder } from '../../profile/service/video-policy.ts';
import type { ItemType, ListingKind, ListingRecord, MediaStore, Store, Tx, UserRecord } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import { AUCTION_LIMITS, auctionState, normalizeAuction, validBids } from './auction-rules.ts';
import type { AuctionInput } from './auction-rules.ts';
import { bidHistoryTx } from './auction.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import { sellerReputationIn } from './trust.ts';
import { publicView } from './public-view.ts';
import type { OwnListing, PublicListing } from './public-view.ts';
import { aliasOf, buildListingSnapshot, listingFingerprint, normalizeConsent, parsePhotos } from './snapshot.ts';
import { assertSources, createLocks, itemTypeOf, itemsOf, parseItems, resourceKeyOf } from './items.ts';
import type { FarmJson } from './snapshot.ts';
import { releaseLocks } from './locks.ts';

export interface Deps { store: Store; media: MediaStore; /** Compresor de videos propios; sin él los videos se guardan tal cual. */ transcoder?: VideoTranscoder; }
export interface Ctx { userId: string; now: Date; }
export { ACTIVE_STATUSES } from './items.ts';
const MAX_PRICE = 1_000_000_000;

export interface ListingInput { photos?: unknown; itemType?: ItemType; birdId?: string; birdIds?: string[]; lotId?: string; quantity?: number; kind: ListingKind; price?: number; terms?: string; consent?: Record<string, unknown>; publish?: boolean; auction?: AuctionInput; }

async function audit(tx: Tx, ctx: Ctx, action: string, listing: ListingRecord, detail: Record<string, unknown> = {}) {
  await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action, targetType: 'listing', targetId: listing.id, detail, createdAt: ctx.now.toISOString() });
}

async function userOf(tx: Tx, id: string): Promise<UserRecord> {
  const user = await tx.users.get(id);
  if (!user) throw new NotFoundError('Usuario no encontrado.');
  return user;
}

function checkTerms(kind: ListingKind, price: unknown, terms: unknown) {
  if (kind !== 'fixed' && kind !== 'interest' && kind !== 'auction') throw new ValidationError('Tipo de publicación no válido.');
  const text = terms === undefined || terms === '' ? '' : typeof terms === 'string' ? terms.trim() : (() => { throw new ValidationError('Las condiciones no son válidas.'); })();
  if (text.length > 1000) throw new ValidationError('Las condiciones superan 1000 caracteres.');
  let value = 0;
  if (kind === 'fixed' || kind === 'auction') {
    value = Number(price);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_PRICE) throw new ValidationError('Indica un precio válido en pesos colombianos.');
    value = Math.round(value);
  }
  return { price: value, terms: text };
}

async function savePhotos(deps: Deps, ownerId: string, photos: { mime: string; bytes: Uint8Array }[]): Promise<string[]> {
  const ids: string[] = [];
  for (const photo of photos) { const id = randomUUID(); await deps.media.put({ id, mime: photo.mime, bytes: photo.bytes, ownerId }); ids.push(id); }
  return ids;
}

async function fillSnapshot(deps: Deps, tx: Tx, listing: ListingRecord, farmData: FarmJson, ctx: Ctx) {
  const seller = await userOf(tx, listing.sellerId);
  const built = buildListingSnapshot(farmData, itemTypeOf(listing), itemsOf(listing), listing.consent, aliasOf(seller), ctx.now);
  let photoIds = listing.photoIds ?? [];
  if (!photoIds.length && built.photo) photoIds = await savePhotos(deps, ctx.userId, [built.photo]);
  listing.snapshot = { ...built.snapshot, ...(photoIds.length ? { photoId: photoIds[0], photoIds } : {}) };
  listing.sourceHash = built.sourceHash;
  listing.needsReview = false;
}

async function assertNoBids(tx: Tx, listing: ListingRecord, message: string) {
  if (listing.kind !== 'auction') return;
  if (validBids(await tx.bids.list({ listingId: listing.id })).length) throw new ConflictError(message);
}

function touch(listing: ListingRecord, ctx: Ctx) { listing.updatedAt = ctx.now.toISOString(); listing.version += 1; }

async function publishInTx(deps: Deps, tx: Tx, listing: ListingRecord, ctx: Ctx, refill = true) {
  const farm = await tx.farms.get(listing.sellerId);
  if (!farm) throw new NotFoundError('No existe la granja del vendedor.');
  await assertSources(tx, listing.sellerId, farm.data, itemTypeOf(listing), itemsOf(listing), listing.id, ctx.now, 'publish');
  if (listing.kind === 'auction') {
    const start = Math.max(listing.opensAt ? new Date(listing.opensAt).getTime() : 0, ctx.now.getTime());
    if (!listing.closesAt || new Date(listing.closesAt).getTime() - start < AUCTION_LIMITS.minDurationMs) throw new ConflictError('La fecha de cierre ya pasó o es demasiado próxima. Crea la subasta de nuevo con otra fecha.');
    listing.opensAt = new Date(start).toISOString();
  }
  if (refill) await fillSnapshot(deps, tx, listing, farm.data, ctx);
  await createLocks(tx, listing, ctx.now);
  listing.status = 'publicada';
  listing.publishedAt = ctx.now.toISOString();
  touch(listing, ctx);
  await tx.listings.update(listing);
  await audit(tx, ctx, 'listing.publish', listing, { price: listing.price, kind: listing.kind });
  await emit(tx, { type: 'market.listing.published', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id }, dedupeKey: `listing-published:${listing.id}:${listing.version}`, now: ctx.now });
}

async function ownListing(tx: Tx, id: string, userId: string): Promise<ListingRecord> {
  const listing = await tx.listings.get(id);
  if (!listing) throw new NotFoundError('Publicación no encontrada.');
  if (listing.sellerId !== userId) throw new ForbiddenError('Esta publicación no es tuya.');
  return listing;
}

export async function createListing(deps: Deps, ctx: Ctx, input: ListingInput): Promise<ListingRecord> {
  const { itemType, items } = parseItems(input);
  const photos = parsePhotos(input.photos);
  const auctionData = input.kind === 'auction' ? (input.auction ? normalizeAuction(input.auction, ctx.now) : (() => { throw new ValidationError('Indica el precio inicial y la fecha de cierre de la subasta.'); })()) : undefined;
  const { price, terms } = checkTerms(input.kind, auctionData ? auctionData.rules.startingPrice : input.price, input.terms);
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    await assertRate(tx, ctx.userId, 'listing.create', ctx.now);
    const farm = await tx.farms.get(ctx.userId);
    if (!farm) throw new NotFoundError('No existe tu granja.');
    const sampleIds = new Set(Object.values((farm.data.demoContent as { idsByCollection?: Record<string, string[]> } | undefined)?.idsByCollection ?? {}).flat());
    if (items.some(item => sampleIds.has(item.type === 'ave' ? item.birdId : item.lotId))) throw new ValidationError('Los registros ficticios de muestra no se pueden publicar en el mercado. Registra un ave o lote real para crear una publicación.');
    const id = randomUUID();
    await assertSources(tx, ctx.userId, farm.data, itemType, items, id, ctx.now, 'create');
    const at = ctx.now.toISOString();
    const listing: ListingRecord = {
      id, birdId: resourceKeyOf(itemType, items, id), itemType, items, sellerId: ctx.userId, kind: input.kind, status: 'borrador', consent: normalizeConsent(input.consent),
      snapshot: undefined as never, sourceHash: '', needsReview: false, price, currency: 'COP', terms, createdAt: at, updatedAt: at, version: 1,
      ...(auctionData ? { auction: auctionData.rules, opensAt: auctionData.opensAt, closesAt: auctionData.closesAt } : {}),
    };
    if (photos.length) listing.photoIds = await savePhotos(deps, ctx.userId, photos);
    await fillSnapshot(deps, tx, listing, farm.data, ctx);
    await tx.listings.insert(listing);
    await audit(tx, ctx, 'listing.create', listing, { kind: listing.kind, itemType });
    if (input.publish) await publishInTx(deps, tx, listing, ctx, false);
    return listing;
  });
}

export async function publishListing(deps: Deps, ctx: Ctx, id: string): Promise<ListingRecord> {
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (listing.status !== 'borrador') throw new ConflictError('Solo se puede publicar un borrador.');
    await publishInTx(deps, tx, listing, ctx);
    return listing;
  });
}

export async function pauseListing(deps: Deps, ctx: Ctx, id: string): Promise<ListingRecord> {
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (listing.status !== 'publicada') throw new ConflictError('Solo se puede pausar una publicación activa.');
    await assertNoBids(tx, listing, 'No puedes pausar una subasta con ofertas: sus condiciones no se pueden alterar.');
    listing.status = 'pausada'; touch(listing, ctx);
    await tx.listings.update(listing); await audit(tx, ctx, 'listing.pause', listing);
    return listing;
  });
}

export async function resumeListing(deps: Deps, ctx: Ctx, id: string): Promise<ListingRecord> {
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (listing.status !== 'pausada') throw new ConflictError('Solo se puede reanudar una publicación pausada.');
    if (listing.needsReview) throw new ConflictError('La ficha cambió. Actualiza la publicación antes de reanudarla.');
    listing.status = 'publicada'; touch(listing, ctx);
    await tx.listings.update(listing); await audit(tx, ctx, 'listing.resume', listing);
    return listing;
  });
}

export async function withdrawListing(deps: Deps, ctx: Ctx, id: string): Promise<ListingRecord> {
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (!['borrador', 'publicada', 'pausada'].includes(listing.status)) throw new ConflictError('Esta publicación ya no se puede retirar.');
    await assertNoBids(tx, listing, 'Esta subasta tiene ofertas: usa «Cancelar subasta», que exige motivo y avisa a los postores.');
    await releaseLocks(tx, listing.id, ctx.now);
    listing.status = 'retirada'; touch(listing, ctx);
    await tx.listings.update(listing); await audit(tx, ctx, 'listing.withdraw', listing);
    return listing;
  });
}

export async function refreshSnapshot(deps: Deps, ctx: Ctx, id: string): Promise<ListingRecord> {
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (!['borrador', 'publicada', 'pausada'].includes(listing.status)) throw new ConflictError('Esta publicación no se puede actualizar.');
    await assertNoBids(tx, listing, 'Una subasta con ofertas no se puede modificar en silencio.');
    const farm = (await tx.farms.get(ctx.userId))!;
    if (listingFingerprint(farm.data, itemTypeOf(listing), itemsOf(listing)) === null) throw new ConflictError('Una fuente de la publicación ya no existe en tu granja. Retira la publicación.');
    await fillSnapshot(deps, tx, listing, farm.data, ctx);
    touch(listing, ctx);
    await tx.listings.update(listing); await audit(tx, ctx, 'listing.refresh', listing);
    return listing;
  });
}

export async function updateListing(deps: Deps, ctx: Ctx, id: string, patch: { price?: number; terms?: string; consent?: Record<string, unknown>; photos?: unknown }): Promise<ListingRecord> {
  const photos = patch.photos === undefined ? undefined : parsePhotos(patch.photos);
  return deps.store.tx(async tx => {
    const listing = await ownListing(tx, id, ctx.userId);
    if (!['borrador', 'publicada', 'pausada'].includes(listing.status)) throw new ConflictError('Esta publicación no se puede editar.');
    await assertNoBids(tx, listing, 'Una subasta con ofertas no se puede editar.');
    if (listing.kind === 'auction' && patch.price !== undefined) throw new ValidationError('Para cambiar las reglas de la subasta, retírala y crea otra.');
    const before = { price: listing.price, terms: listing.terms };
    const checked = checkTerms(listing.kind, patch.price ?? listing.price, patch.terms ?? listing.terms);
    if (checked.price !== listing.price && (await tx.operations.list({ listingId: listing.id })).some(op => !['cancelada', 'completada'].includes(op.status))) throw new ConflictError('Hay solicitudes u operaciones abiertas sobre esta publicación: respóndelas antes de cambiar el precio.');
    listing.price = checked.price; listing.terms = checked.terms;
    if (patch.consent) listing.consent = normalizeConsent(patch.consent, listing.consent);
    if (photos) listing.photoIds = await savePhotos(deps, ctx.userId, photos);
    if (patch.consent || photos) {
      const farm = (await tx.farms.get(ctx.userId))!;
      await fillSnapshot(deps, tx, listing, farm.data, ctx);
    }
    touch(listing, ctx);
    await tx.listings.update(listing);
    await audit(tx, ctx, 'listing.update', listing, { before, after: { price: listing.price, terms: listing.terms } });
    return listing;
  });
}

/** Tras guardar la granja: avisa si cambió la ficha de un ave publicada. No toca la publicación. */
export async function flagListingsForReview(tx: Tx, userId: string, nextData: FarmJson, now: Date): Promise<void> {
  for (const listing of await tx.listings.list({ sellerId: userId })) {
    if (!['borrador', 'publicada', 'pausada'].includes(listing.status) || listing.needsReview) continue;
    const current = listingFingerprint(nextData, itemTypeOf(listing), itemsOf(listing));
    if (current === listing.sourceHash) continue;
    await tx.listings.update({ ...listing, needsReview: true, updatedAt: now.toISOString(), version: listing.version + 1 });
    await emit(tx, { type: 'market.listing.needs_review', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id }, dedupeKey: `review:${listing.id}:${current ?? 'sin-ave'}`, now });
  }
}

// ---- Interesados ----

export async function addInterest(deps: Deps, ctx: Ctx, listingId: string, message: unknown) {
  await deps.store.tx(tx => assertActive(tx, ctx.userId));
  const text = message === undefined || message === '' ? '' : typeof message === 'string' ? message.trim() : (() => { throw new ValidationError('El mensaje no es válido.'); })();
  if (text.length > 500) throw new ValidationError('El mensaje supera 500 caracteres.');
  return deps.store.tx(async tx => {
    const listing = await tx.listings.get(listingId);
    if (!listing || listing.status !== 'publicada') throw new NotFoundError('Esta publicación no está disponible.');
    if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes mostrar interés en tu propia publicación.');
    const at = ctx.now.toISOString();
    const existing = (await tx.interests.list({ listingId, userId: ctx.userId }))[0];
    if (existing?.status === 'activo') return existing;
    let interest;
    if (existing) {
      interest = { ...existing, status: 'activo' as const, message: text, revision: existing.revision + 1, updatedAt: at };
      await tx.interests.update(interest);
    } else {
      interest = { id: randomUUID(), listingId, userId: ctx.userId, status: 'activo' as const, message: text, revision: 1, createdAt: at, updatedAt: at };
      await tx.interests.insert(interest);
    }
    await emit(tx, { type: 'market.interest.created', aggregateType: 'listing', aggregateId: listingId, payload: { listingId, interestId: interest.id }, dedupeKey: `interest:${interest.id}:${interest.revision}`, now: ctx.now });
    return interest;
  });
}

export async function withdrawInterest(deps: Deps, ctx: Ctx, listingId: string) {
  return deps.store.tx(async tx => {
    const existing = (await tx.interests.list({ listingId, userId: ctx.userId }))[0];
    if (!existing || existing.status === 'retirado') throw new NotFoundError('No tienes interés registrado en esta publicación.');
    await tx.interests.update({ ...existing, status: 'retirado', updatedAt: ctx.now.toISOString() });
  });
}

export async function listInterests(deps: Deps, ctx: Ctx, listingId: string) {
  return deps.store.tx(async tx => {
    await ownListing(tx, listingId, ctx.userId);
    const rows = (await tx.interests.list({ listingId })).filter(row => row.status === 'activo').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out = [];
    for (const row of rows) {
      const user = await tx.users.get(row.userId);
      out.push({ id: row.id, userId: row.userId, alias: user ? aliasOf(user) : 'Usuario', message: row.message, createdAt: row.createdAt, status: row.status });
    }
    return out;
  });
}

// ---- Consultas ----

export interface BrowseQuery { q?: string; type?: string; breed?: string; species?: string; sex?: string; /** Ubicación de quien mira: lo de su ciudad y su departamento sale primero. */ location?: { city: string; region?: string }; kind?: string; min?: number; max?: number; limit?: number; offset?: number; }

/** Proyección pública de un conjunto de publicaciones (alias y reputación del vendedor, estado de la subasta). */
export async function publicListingsIn(tx: Tx, rows: ListingRecord[], now: Date): Promise<PublicListing[]> {
  const items: PublicListing[] = [];
  const aliases = new Map<string, string>(), stats = new Map<string, Awaited<ReturnType<typeof sellerReputationIn>>>();
  for (const row of rows) {
    if (!aliases.has(row.sellerId)) { const owner = await tx.users.get(row.sellerId); aliases.set(row.sellerId, owner ? aliasOf(owner) : 'Criador'); stats.set(row.sellerId, await sellerReputationIn(tx, row.sellerId)); }
    items.push(publicView(row, aliases.get(row.sellerId)!, auctionState(row, row.kind === 'auction' ? await tx.bids.list({ listingId: row.id }) : [], now), stats.get(row.sellerId)));
  }
  return items;
}

export async function browseListings(store: Store, query: BrowseQuery, now: Date = new Date()): Promise<{ items: PublicListing[]; total: number }> {
  const needle = (query.q ?? '').toLocaleLowerCase('es-CO').trim();
  return store.tx(async tx => {
    const rows = (await tx.listings.list({ status: 'publicada' }))
      .filter(row => !query.kind || row.kind === query.kind)
      .filter(row => !query.type || itemTypeOf(row) === query.type)
      .filter(row => !query.breed || row.snapshot.breed === query.breed)
      .filter(row => !query.species || (itemTypeOf(row) !== 'insumo' && speciesOf(row.snapshot.species) === query.species))
      .filter(row => !query.sex || row.snapshot.sex === query.sex)
      .filter(row => query.min === undefined || row.price >= query.min)
      .filter(row => query.max === undefined || row.price <= query.max)
      .filter(row => !needle || `${row.snapshot.name} ${row.snapshot.title ?? ''} ${row.snapshot.breed} ${row.snapshot.species ? SPECIES_LABELS[speciesOf(row.snapshot.species)] : ''} ${row.snapshot.code} ${row.snapshot.description}`.toLocaleLowerCase('es-CO').includes(needle))
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    if (query.location?.city) {
      // Orden estable: primero mi ciudad, luego mi departamento, luego el resto; dentro de cada grupo se conserva «más nuevo primero».
      const sellers = new Map<string, UserRecord | undefined>();
      for (const row of rows) if (!sellers.has(row.sellerId)) sellers.set(row.sellerId, await tx.users.get(row.sellerId));
      const bucket = (row: ListingRecord) => proximityBucket(query.location, sellers.get(row.sellerId)?.location ?? row.snapshot.deliveryZone);
      const ranks = new Map(rows.map(row => [row.id, bucket(row)]));
      rows.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
    }
    const limit = Math.min(Math.max(query.limit ?? 24, 1), 60), offset = Math.max(query.offset ?? 0, 0);
    const items = await publicListingsIn(tx, rows.slice(offset, offset + limit), now);
    return { items, total: rows.length };
  });
}

export async function getListingForViewer(store: Store, id: string, viewerId?: string, now: Date = new Date()) {
  return store.tx(async tx => {
    const listing = await tx.listings.get(id);
    if (!listing) throw new NotFoundError('Publicación no encontrada.');
    const isOwner = viewerId === listing.sellerId;
    if (!isOwner && listing.status !== 'publicada') throw new NotFoundError('Publicación no encontrada.');
    const seller = await tx.users.get(listing.sellerId);
    const mine = viewerId && !isOwner ? (await tx.interests.list({ listingId: id, userId: viewerId })).find(row => row.status === 'activo') : undefined;
    const bids = listing.kind === 'auction' ? await tx.bids.list({ listingId: id }) : [];
    const state = auctionState(listing, bids, now);
    const myOp = viewerId && !isOwner ? (await tx.operations.list({ listingId: id })).find(op => op.buyerId === viewerId && !['cancelada', 'completada'].includes(op.status)) : undefined;
    const myThread = viewerId && !isOwner ? (await tx.threads.list({ listingId: id })).find(thread => thread.participants.includes(viewerId)) : undefined;
    return {
      listing: publicView(listing, seller ? aliasOf(seller) : 'Criador', state, await sellerReputationIn(tx, listing.sellerId)),
      bids: listing.kind === 'auction' ? await bidHistoryTx(tx, id, viewerId) : [],
      viewer: { isOwner, signedIn: Boolean(viewerId), hasInterest: Boolean(mine), isTopBidder: Boolean(viewerId && state && bids.length && validBids(bids).some(bid => bid.bidderId === viewerId && bid.amount === state.currentPrice)), operationId: myOp?.id, operationStatus: myOp?.status, threadId: myThread?.id },
    };
  });
}

export async function myListings(store: Store, userId: string, filter?: string, now: Date = new Date()): Promise<OwnListing[]> {
  return store.tx(async tx => {
    const seller = await userOf(tx, userId);
    const rows = (await tx.listings.list({ sellerId: userId })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const out: OwnListing[] = [];
    for (const row of rows) {
      const interestCount = (await tx.interests.list({ listingId: row.id })).filter(item => item.status === 'activo').length;
      const bids = row.kind === 'auction' ? await tx.bids.list({ listingId: row.id }) : [];
      const ops = await tx.operations.list({ listingId: row.id });
      const pending = ops.filter(op => op.status === 'solicitud_recibida').length;
      const active = ops.find(op => !['solicitud_recibida', 'cancelada', 'completada'].includes(op.status));
      out.push({ ...publicView(row, aliasOf(seller), auctionState(row, bids, now)), pendingRequests: pending, ...(active ? { operationStatus: active.status, operationId: active.id } : {}), birdId: row.birdId, needsReview: row.needsReview, interestCount, version: row.version, ...(row.closedReason ? { closedReason: row.closedReason } : {}) });
    }
    if (!filter || filter === 'todas') return out;
    const soon = 24 * 3_600_000;
    switch (filter) {
      case 'con_interesados': return out.filter(row => row.status === 'publicada' && row.interestCount > 0);
      case 'con_ofertas': return out.filter(row => row.kind === 'auction' && row.status === 'publicada' && (row.auction?.bidCount ?? 0) > 0);
      case 'por_cerrar': return out.filter(row => row.kind === 'auction' && row.status === 'publicada' && row.closesAt !== undefined && new Date(row.closesAt).getTime() - now.getTime() <= soon && new Date(row.closesAt) > now);
      case 'pendiente_confirmar': return out.filter(row => row.pendingRequests > 0 || row.operationStatus === 'aceptada');
      case 'pendiente_pago': return out.filter(row => row.operationStatus === 'pago_pendiente' || row.operationStatus === 'pago_registrado');
      case 'pendiente_entrega': return out.filter(row => row.operationStatus === 'entrega_pendiente' || row.operationStatus === 'entrega_confirmada');
      case 'requieren_revision': return out.filter(row => row.needsReview);
      case 'retirada': return out.filter(row => ['retirada', 'cancelada', 'rechazada', 'cerrada_sin_ofertas'].includes(row.status));
      default: return out.filter(row => row.status === filter);
    }
  });
}
