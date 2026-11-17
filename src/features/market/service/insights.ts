import type { OperationRecord, Store } from '../../../server/storage/types.ts';
import { ValidationError } from '../../../server/errors.ts';
import { reputationIn } from './trust.ts';

export interface InsightsRange { from: string; to: string; }

function range(from: unknown, to: unknown, now: Date): InsightsRange {
  const parse = (value: unknown, fallback: Date) => {
    if (value === undefined || value === null || value === '') return fallback;
    const date = new Date(`${String(value)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new ValidationError('Fecha no válida (usa AAAA-MM-DD).');
    return date;
  };
  const end = parse(to, now), start = parse(from, new Date(end.getTime() - 90 * 86_400_000));
  if (start > end) throw new ValidationError('La fecha inicial no puede ser posterior a la final.');
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
const within = (iso: string | undefined, r: InsightsRange) => Boolean(iso) && iso!.slice(0, 10) >= r.from && iso!.slice(0, 10) <= r.to;
const completedAt = (op: OperationRecord) => op.history.find(entry => entry.status === 'completada')?.at;

/** Informe comercial personal: lo que vendiste, compraste y ofertaste en el periodo. Solo cuenta operaciones reales completadas como ingresos. */
export async function commercialInsights(store: Store, userId: string, from: unknown, to: unknown, now: Date) {
  const r = range(from, to, now);
  return store.tx(async tx => {
    const listings = await tx.listings.list({ sellerId: userId });
    const sales = await tx.operations.list({ sellerId: userId }), purchases = await tx.operations.list({ buyerId: userId });
    const soldInRange = sales.filter(op => op.status === 'completada' && within(completedAt(op), r));
    const boughtInRange = purchases.filter(op => op.status === 'completada' && within(completedAt(op), r));
    const days: number[] = [];
    for (const op of soldInRange) {
      const listing = listings.find(item => item.id === op.listingId);
      if (listing?.publishedAt) days.push((new Date(completedAt(op)!).getTime() - new Date(listing.publishedAt).getTime()) / 86_400_000);
    }
    const mine = listings.filter(item => within(item.createdAt, r));
    const myIds = new Set(listings.map(item => item.id));
    const interests = (await tx.interests.list()).filter(row => myIds.has(row.listingId) && within(row.createdAt, r)).length;
    let bidsReceived = 0;
    for (const listing of listings.filter(item => item.kind === 'auction')) bidsReceived += (await tx.bids.list({ listingId: listing.id })).filter(bid => within(bid.placedAt, r)).length;
    const myBids = (await tx.bids.list({ bidderId: userId })).filter(bid => within(bid.placedAt, r));
    const requests = sales.filter(op => op.origin === 'directa' && within(op.createdAt, r)).length;
    const ended = sales.filter(op => within(op.updatedAt, r) && ['completada', 'cancelada'].includes(op.status));
    return {
      range: r,
      selling: {
        listingsCreated: mine.length, byKind: { fixed: mine.filter(i => i.kind === 'fixed').length, auction: mine.filter(i => i.kind === 'auction').length, interest: mine.filter(i => i.kind === 'interest').length },
        active: listings.filter(item => ['publicada', 'pausada', 'en_operacion'].includes(item.status)).length,
        sold: soldInRange.length, revenue: soldInRange.reduce((sum, op) => sum + op.price, 0),
        averageDaysToSell: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
        interests, bidsReceived, purchaseRequests: requests,
        cancelledOperations: ended.filter(op => op.status === 'cancelada').length,
      },
      buying: {
        purchases: boughtInRange.length, spent: boughtInRange.reduce((sum, op) => sum + op.price, 0),
        bidsPlaced: myBids.length, auctionsWon: purchases.filter(op => op.origin === 'subasta' && within(op.createdAt, r)).length,
        requestsMade: purchases.filter(op => op.origin === 'directa' && within(op.createdAt, r)).length,
      },
      reputation: await reputationIn(tx, userId),
      note: 'Los ingresos y gastos suman solo operaciones completadas con transferencia de propiedad; los pagos son declarados por las partes y no están verificados por la plataforma.',
    };
  });
}
