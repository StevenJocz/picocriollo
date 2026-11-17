import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { BidRecord, ListingRecord, Store, Tx } from '../../../server/storage/types.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import { emit } from '../../notifications/service/events.ts';
import { AUCTION_LIMITS, auctionState, topBid, validBids } from './auction-rules.ts';
import type { Ctx } from './listings.ts';
import { assertReason, newOperation, pushHistory } from './operations.ts';
import { aliasOf } from './snapshot.ts';
import { releaseLocks, reserveLocks } from './locks.ts';

async function audit(tx: Tx, actorId: string, action: string, listing: ListingRecord, detail: Record<string, unknown>, now: Date) {
  await tx.audit.insert({ id: randomUUID(), actorId, action, targetType: 'listing', targetId: listing.id, detail, createdAt: now.toISOString() });
}

/** Oferta vinculante (no es un pago). Reglas: abierta, no vendedor, supera el mínimo, idempotente por clave. */
export async function placeBid(store: Store, ctx: Ctx, listingId: string, amountInput: unknown, idempotencyKey: unknown): Promise<BidRecord> {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0 || amount > AUCTION_LIMITS.maxPrice) throw new ValidationError('Indica un importe válido en pesos colombianos.');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 80) throw new ValidationError('Falta la clave de la oferta.');
  const value = Math.round(amount);
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const listing = await tx.listings.get(listingId);
    if (!listing || listing.kind !== 'auction' || !listing.auction) throw new NotFoundError('Subasta no encontrada.');
    if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes ofertar en tu propia subasta.');
    const repeated = (await tx.bids.list({ listingId, bidderId: ctx.userId, idempotencyKey }))[0];
    if (repeated) return repeated;
    if (listing.status !== 'publicada') throw new ConflictError('Esta subasta ya no admite ofertas.');
    await assertRate(tx, ctx.userId, 'auction.bid', ctx.now);
    if (listing.opensAt && ctx.now < new Date(listing.opensAt)) throw new ConflictError('La subasta aún no ha abierto.');
    if (listing.closesAt && ctx.now >= new Date(listing.closesAt)) throw new ConflictError('La subasta ya cerró: no se aceptan ofertas nuevas.');
    const bids = await tx.bids.list({ listingId });
    const top = topBid(bids);
    if (top?.bidderId === ctx.userId) throw new ConflictError('Ya tienes la oferta más alta.');
    const minimum = auctionState(listing, bids, ctx.now)!.minNextBid;
    if (value < minimum) throw new ValidationError(`Tu oferta debe ser de al menos ${minimum.toLocaleString('es-CO')} COP.`);
    const bid: BidRecord = { id: randomUUID(), listingId, bidderId: ctx.userId, amount: value, seq: bids.length + 1, idempotencyKey, status: 'valida', placedAt: ctx.now.toISOString() };
    await tx.bids.insert(bid);
    if (top) await tx.bids.update({ ...top, status: 'superada' });
    const sniping = listing.auction.antiSniping;
    if (sniping && listing.closesAt && new Date(listing.closesAt).getTime() - ctx.now.getTime() <= sniping.windowSeconds * 1000 && (listing.extensions ?? 0) < AUCTION_LIMITS.antiSniping.maxExtensions) {
      listing.closesAt = new Date(new Date(listing.closesAt).getTime() + sniping.extendSeconds * 1000).toISOString();
      listing.extensions = (listing.extensions ?? 0) + 1;
      listing.updatedAt = ctx.now.toISOString(); listing.version += 1;
      await tx.listings.update(listing);
    }
    await audit(tx, ctx.userId, 'auction.bid', listing, { bidId: bid.id, amount: value }, ctx.now);
    await emit(tx, { type: 'market.bid.received', aggregateType: 'listing', aggregateId: listingId, payload: { listingId, bidId: bid.id }, dedupeKey: `bid-received:${bid.id}`, now: ctx.now });
    if (top) await emit(tx, { type: 'market.bid.outbid', aggregateType: 'listing', aggregateId: listingId, payload: { listingId, bidId: bid.id, previousBidId: top.id }, dedupeKey: `bid-outbid:${top.id}:${bid.id}`, now: ctx.now });
    return bid;
  });
}

export interface PublicBid { alias: string; amount: number; placedAt: string; status: BidRecord['status']; mine: boolean; }

/** Historial público: alias estables por subasta ("Postor 1"…), sin identidades ni datos privados. */
export async function bidHistory(store: Store, listingId: string, viewerId?: string): Promise<PublicBid[]> {
  return store.tx(tx => bidHistoryTx(tx, listingId, viewerId));
}

export async function bidHistoryTx(tx: Tx, listingId: string, viewerId?: string): Promise<PublicBid[]> {
  {
    const bids = (await tx.bids.list({ listingId })).sort((a, b) => a.seq - b.seq);
    const labels = new Map<string, string>();
    for (const bid of bids) if (!labels.has(bid.bidderId)) labels.set(bid.bidderId, `Postor ${labels.size + 1}`);
    return bids.map(bid => ({ alias: labels.get(bid.bidderId)!, amount: bid.amount, placedAt: bid.placedAt, status: bid.status, mine: bid.bidderId === viewerId })).reverse();
  }
}

async function endAuction(tx: Tx, listing: ListingRecord, bids: BidRecord[], now: Date) {
  const top = topBid(bids);
  const reserve = listing.auction?.reservePrice;
  const bidders = [...new Set(bids.map(bid => bid.bidderId))];
  const detail = { totalBids: bids.length, topBidId: top?.id ?? null, topAmount: top?.amount ?? null, reserve: reserve ?? null };
  listing.updatedAt = now.toISOString(); listing.version += 1;

  if (top && (reserve === undefined || top.amount >= reserve)) {
    for (const bid of bids) await tx.bids.update({ ...bid, status: bid.id === top.id ? 'ganadora' : 'no_ganadora' });
    const op = await newOperation(tx, { listing, buyerId: top.bidderId, origin: 'subasta', price: top.amount, status: 'aceptada', now, actorId: listing.sellerId });
    pushHistory(op, 'pago_pendiente', listing.sellerId, now, 'Pago pendiente');
    await tx.operations.update(op);
    await reserveLocks(tx, listing.id, op.id);
    listing.status = 'en_operacion'; listing.winningBidId = top.id; listing.closedReason = 'adjudicada';
    await tx.listings.update(listing);
    await audit(tx, 'sistema', 'auction.close', listing, { ...detail, outcome: 'adjudicada', operationId: op.id, rule: 'oferta más alta; empate: la más temprana' }, now);
    await emit(tx, { type: 'market.auction.won', aggregateType: 'operation', aggregateId: op.id, payload: { listingId: listing.id, operationId: op.id, bidId: top.id }, dedupeKey: `auction-won:${listing.id}:${top.id}`, now });
    await emit(tx, { type: 'market.auction.ended', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, outcome: 'sold', operationId: op.id, amount: top.amount }, dedupeKey: `auction-ended:${listing.id}`, now });
    await emit(tx, { type: 'market.auction.lost', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, bidderIds: bidders.filter(id => id !== top.bidderId) }, dedupeKey: `auction-lost:${listing.id}`, now });
    return;
  }
  for (const bid of bids) await tx.bids.update({ ...bid, status: 'no_ganadora' });
  await releaseLocks(tx, listing.id, now);
  const outcome = top ? 'reserve_not_met' : 'no_bids';
  listing.status = 'cerrada_sin_ofertas'; listing.closedReason = top ? 'reserva_no_alcanzada' : 'sin_ofertas';
  await tx.listings.update(listing);
  await audit(tx, 'sistema', 'auction.close', listing, { ...detail, outcome }, now);
  await emit(tx, { type: 'market.auction.ended', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, outcome, amount: top?.amount ?? 0 }, dedupeKey: `auction-ended:${listing.id}`, now });
  if (bidders.length) await emit(tx, { type: 'market.auction.lost', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, bidderIds: bidders, reserveNotMet: Boolean(top) }, dedupeKey: `auction-lost:${listing.id}`, now });
}

/** Cierra las subastas vencidas. Idempotente: una subasta ya cerrada no se vuelve a procesar. */
export async function closeDueAuctions(store: Store, now: Date): Promise<{ closed: number }> {
  const due = await store.tx(async tx => (await tx.listings.list({ status: 'publicada' })).filter(item => item.kind === 'auction' && item.closesAt && new Date(item.closesAt) <= now).map(item => item.id));
  let closed = 0;
  for (const id of due) {
    const did = await store.tx(async tx => {
      const listing = await tx.listings.get(id);
      if (!listing || listing.status !== 'publicada' || !listing.closesAt || new Date(listing.closesAt) > now) return false;
      await endAuction(tx, listing, await tx.bids.list({ listingId: id }), now);
      return true;
    });
    if (did) closed++;
  }
  return { closed };
}

/** Avisa a vendedor y postores cuando falta poco para el cierre. La clave incluye el cierre: si se extiende, avisa de nuevo. */
export async function notifyClosingSoon(store: Store, now: Date, windowMs = 2 * 3_600_000): Promise<{ notified: number }> {
  return store.tx(async tx => {
    let notified = 0;
    for (const listing of (await tx.listings.list({ status: 'publicada' })).filter(item => item.kind === 'auction' && item.closesAt)) {
      const left = new Date(listing.closesAt!).getTime() - now.getTime();
      if (left <= 0 || left > windowMs) continue;
      if (await emit(tx, { type: 'market.auction.closing_soon', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, closesAt: listing.closesAt }, dedupeKey: `auction-closing:${listing.id}:${listing.closesAt}`, now })) notified++;
    }
    return { notified };
  });
}

export async function runDueJobs(store: Store, now: Date) {
  const closed = await closeDueAuctions(store, now);
  const soon = await notifyClosingSoon(store, now);
  return { ...closed, ...soon };
}

/** Cancelación con reglas: libre sin ofertas; con ofertas solo con >24 h al cierre, con motivo y avisando a los postores. */
export async function cancelAuction(store: Store, ctx: Ctx, listingId: string, reason: unknown): Promise<ListingRecord> {
  return store.tx(async tx => {
    const listing = await tx.listings.get(listingId);
    if (!listing || listing.kind !== 'auction') throw new NotFoundError('Subasta no encontrada.');
    if (listing.sellerId !== ctx.userId) throw new ForbiddenError('Esta subasta no es tuya.');
    if (listing.status !== 'publicada' && listing.status !== 'pausada') throw new ConflictError('Esta subasta ya no se puede cancelar.');
    const bids = await tx.bids.list({ listingId });
    const hasBids = validBids(bids).length > 0;
    if (hasBids) {
      const left = listing.closesAt ? new Date(listing.closesAt).getTime() - ctx.now.getTime() : 0;
      if (left < AUCTION_LIMITS.cancelWithBidsMinMs) throw new ConflictError('Con ofertas registradas solo puedes cancelar si faltan más de 24 horas para el cierre. Tras ese plazo la subasta se adjudicará según las reglas.');
    }
    const text = hasBids ? assertReason(reason) : typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    await releaseLocks(tx, listing.id, ctx.now);
    for (const bid of bids) await tx.bids.update({ ...bid, status: 'no_ganadora' });
    listing.status = 'cancelada'; listing.closedReason = text || 'cancelada_por_el_vendedor';
    listing.updatedAt = ctx.now.toISOString(); listing.version += 1;
    await tx.listings.update(listing);
    await audit(tx, ctx.userId, 'auction.cancel', listing, { reason: text, bids: bids.length }, ctx.now);
    if (hasBids) await emit(tx, { type: 'market.auction.cancelled', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, bidderIds: [...new Set(bids.map(bid => bid.bidderId))], reason: text }, dedupeKey: `auction-cancelled:${listing.id}`, now: ctx.now });
    return listing;
  });
}

export async function myBids(store: Store, userId: string, now: Date) {
  return store.tx(async tx => {
    const mine = await tx.bids.list({ bidderId: userId });
    const byListing = new Map<string, BidRecord[]>();
    for (const bid of mine) byListing.set(bid.listingId, [...(byListing.get(bid.listingId) ?? []), bid]);
    const out = [];
    for (const [listingId, own] of byListing) {
      const listing = await tx.listings.get(listingId);
      if (!listing) continue;
      const all = await tx.bids.list({ listingId });
      const state = auctionState(listing, all, now)!;
      const best = [...own].sort((a, b) => b.amount - a.amount)[0];
      const seller = await tx.users.get(listing.sellerId);
      out.push({
        listingId, birdName: listing.snapshot.name, birdCode: listing.snapshot.code, sellerAlias: seller ? aliasOf(seller) : 'Criador', sellerId: listing.sellerId, closesAt: listing.closesAt, listingStatus: listing.status,
        myBest: best.amount, currentPrice: state.currentPrice, phase: state.phase,
        result: best.status === 'ganadora' ? 'ganadora' : listing.status === 'publicada' ? (own.some(bid => bid.status === 'valida') ? 'liderando' : 'superada') : 'no_ganadora',
        ...(listing.status === 'cancelada' ? { cancelled: true } : {}),
      });
    }
    return out.sort((a, b) => String(b.closesAt).localeCompare(String(a.closesAt)));
  });
}
