import type { ItemType, ListingKind, ListingRecord, ListingStatus, OperationStatus, PublicSnapshot } from '../../../server/storage/types.ts';
import type { AuctionState } from './auction-rules.ts';

// Única forma en que una publicación sale del servidor hacia el público.
// Lista de campos explícita: lo que no se nombra aquí nunca se expone (notas, dueño, birdId, hash, consentimientos).
export interface PublicListing {
  id: string; sellerId: string; kind: ListingKind; status: ListingStatus; price: number; currency: 'COP'; terms: string;
  snapshot: Omit<PublicSnapshot, 'photoId' | 'photoIds'> & { photoUrl?: string; photoUrls?: string[] };
  sellerAlias: string; publishedAt?: string; closesAt?: string; opensAt?: string;
  auction?: AuctionState & { minIncrement: number; hasReserve: boolean; antiSniping: boolean };
  /** Reputación del vendedor: solo de operaciones reales completadas. */
  sellerReputation?: { count: number; average: number; completed: number };
}

export function publicView(listing: ListingRecord, sellerAlias: string, state?: AuctionState, reputation?: { count: number; average: number; completed: number }): PublicListing {
  const s = listing.snapshot;
  return {
    id: listing.id, sellerId: listing.sellerId, kind: listing.kind, status: listing.status, price: listing.price, currency: listing.currency, terms: listing.terms,
    snapshot: {
      name: s.name, code: s.code, ring: s.ring, breed: s.breed, sex: s.sex, bornAt: s.bornAt, ageLabel: s.ageLabel,
      description: s.description, deliveryZone: s.deliveryZone, declaredBySeller: true,
      ...(s.photoIds?.length ? { photoUrls: s.photoIds.map(id => `/api/media/${id}`), photoUrl: `/api/media/${s.photoIds[0]}` } : s.photoId ? { photoUrls: [`/api/media/${s.photoId}`], photoUrl: `/api/media/${s.photoId}` } : {}),
      ...(s.healthNote ? { healthNote: s.healthNote } : {}),
      ...(s.breeder ? { breeder: s.breeder } : {}),
      ...(s.genealogy ? { genealogy: s.genealogy } : {}),
      ...(s.offspringCount !== undefined ? { offspringCount: s.offspringCount } : {}),
      ...(s.species ? { species: s.species } : {}),
      ...(s.itemType ? { itemType: s.itemType } : {}),
      ...(s.quantity !== undefined ? { quantity: s.quantity } : {}),
      ...(s.title ? { title: s.title } : {}),
      ...(s.lotBirds ? { lotBirds: s.lotBirds } : {}),
      ...(s.fertility ? { fertility: s.fertility } : {}),
    },
    sellerAlias, ...(reputation ? { sellerReputation: reputation } : {}),
    ...(listing.publishedAt ? { publishedAt: listing.publishedAt } : {}),
    ...(listing.opensAt ? { opensAt: listing.opensAt } : {}),
    ...(listing.closesAt ? { closesAt: listing.closesAt } : {}),
    ...(state && listing.auction ? { auction: { ...state, minIncrement: listing.auction.minIncrement, hasReserve: listing.auction.reservePrice !== undefined, antiSniping: Boolean(listing.auction.antiSniping) } } : {}),
  };
}

export interface OwnListing extends PublicListing {
  birdId: string; needsReview: boolean; interestCount: number; pendingRequests: number; version: number; closedReason?: string;
  operationStatus?: OperationStatus; operationId?: string;
}

export const ITEM_LABELS: Record<ItemType, string> = { ave: 'Ave', lote_aves: 'Lote de aves', lote_pollitos: 'Lote de pollitos', lote_huevos: 'Lote de huevos', insumo: 'Insumo' };
export const KIND_LABELS: Record<ListingKind, string> = { fixed: 'Precio fijo', auction: 'Subasta', interest: 'Publicación de interés' };
export const STATUS_LABELS: Record<ListingStatus, string> = {
  borrador: 'Borrador', publicada: 'Publicada', pausada: 'Pausada', en_operacion: 'En operación', vendida: 'Vendida',
  retirada: 'Retirada', cancelada: 'Cancelada', rechazada: 'Rechazada por moderación', cerrada_sin_ofertas: 'Cerrada sin ofertas',
};
