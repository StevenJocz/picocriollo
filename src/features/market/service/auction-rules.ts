import { ValidationError } from '../../../server/errors.ts';
import type { AuctionRules, BidRecord, ListingRecord } from '../../../server/storage/types.ts';

// Reglas de subasta. Sin imports de servidor para poder usarlas también en la interfaz.
export const AUCTION_LIMITS = {
  minPrice: 1_000, maxPrice: 1_000_000_000, incrementFloor: 1_000, incrementPercent: 0.05,
  minDurationMs: 60 * 60_000, maxDurationMs: 30 * 86_400_000, cancelWithBidsMinMs: 24 * 3_600_000,
  antiSniping: { windowSeconds: 300, extendSeconds: 300, maxExtensions: 12 },
};

/** Incremento por defecto: el mayor entre 1.000 COP y el 5 % del precio inicial, redondeado a 100. */
export function defaultMinIncrement(startingPrice: number): number {
  return Math.max(AUCTION_LIMITS.incrementFloor, Math.round((startingPrice * AUCTION_LIMITS.incrementPercent) / 100) * 100);
}

export interface AuctionInput { startingPrice: unknown; minIncrement?: unknown; reservePrice?: unknown; antiSniping?: unknown; opensAt?: unknown; closesAt: unknown; }

const toDate = (value: unknown, label: string): Date => {
  const date = new Date(String(value));
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) throw new ValidationError(`${label} no es una fecha válida.`);
  return date;
};

export function normalizeAuction(input: AuctionInput, now: Date): { rules: AuctionRules; opensAt: string; closesAt: string } {
  const starting = Number(input.startingPrice);
  if (!Number.isFinite(starting) || starting < AUCTION_LIMITS.minPrice || starting > AUCTION_LIMITS.maxPrice) throw new ValidationError(`El precio inicial debe estar entre ${AUCTION_LIMITS.minPrice.toLocaleString('es-CO')} y ${AUCTION_LIMITS.maxPrice.toLocaleString('es-CO')} COP.`);
  const startingPrice = Math.round(starting);
  let minIncrement = defaultMinIncrement(startingPrice);
  if (input.minIncrement !== undefined && input.minIncrement !== '' && input.minIncrement !== null) {
    const value = Number(input.minIncrement);
    if (!Number.isFinite(value) || value < 100 || value > startingPrice * 2) throw new ValidationError('El incremento mínimo no es válido (mínimo 100 COP).');
    minIncrement = Math.round(value);
  }
  const rules: AuctionRules = { startingPrice, minIncrement };
  if (input.reservePrice !== undefined && input.reservePrice !== '' && input.reservePrice !== null) {
    const reserve = Number(input.reservePrice);
    if (!Number.isFinite(reserve) || reserve < startingPrice || reserve > AUCTION_LIMITS.maxPrice) throw new ValidationError('El precio de reserva no puede ser menor que el precio inicial.');
    rules.reservePrice = Math.round(reserve);
  }
  if (input.antiSniping === true) rules.antiSniping = { windowSeconds: AUCTION_LIMITS.antiSniping.windowSeconds, extendSeconds: AUCTION_LIMITS.antiSniping.extendSeconds };
  const opens = input.opensAt === undefined || input.opensAt === '' || input.opensAt === null ? now : toDate(input.opensAt, 'La fecha de apertura');
  const closes = toDate(input.closesAt, 'La fecha de cierre');
  const start = Math.max(opens.getTime(), now.getTime());
  if (closes.getTime() - start < AUCTION_LIMITS.minDurationMs) throw new ValidationError('La subasta debe durar al menos 1 hora desde su apertura.');
  if (closes.getTime() - start > AUCTION_LIMITS.maxDurationMs) throw new ValidationError('La subasta no puede durar más de 30 días.');
  return { rules, opensAt: new Date(start).toISOString(), closesAt: closes.toISOString() };
}

export type AuctionPhase = 'programada' | 'abierta' | 'cerrada';
export interface AuctionState { phase: AuctionPhase; currentPrice: number; startingPrice: number; bidCount: number; minNextBid: number; topBidAlias?: string; }

export const validBids = (bids: BidRecord[]) => bids.filter(bid => bid.status === 'valida');
export const topBid = (bids: BidRecord[]): BidRecord | undefined =>
  [...validBids(bids)].sort((a, b) => b.amount - a.amount || a.seq - b.seq)[0];

export function auctionState(listing: ListingRecord, bids: BidRecord[], now: Date): AuctionState | undefined {
  const rules = listing.auction;
  if (listing.kind !== 'auction' || !rules) return undefined;
  const top = topBid(bids);
  const open = listing.status === 'publicada' && (!listing.opensAt || now >= new Date(listing.opensAt)) && (!listing.closesAt || now < new Date(listing.closesAt));
  const scheduled = listing.status === 'publicada' && listing.opensAt !== undefined && now < new Date(listing.opensAt);
  return {
    phase: scheduled ? 'programada' : open ? 'abierta' : 'cerrada',
    currentPrice: top ? top.amount : rules.startingPrice, startingPrice: rules.startingPrice, bidCount: bids.length,
    minNextBid: top ? top.amount + rules.minIncrement : rules.startingPrice,
  };
}
