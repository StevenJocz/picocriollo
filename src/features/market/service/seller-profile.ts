import { NotFoundError } from '../../../server/errors.ts';
import type { ItemType, Store } from '../../../server/storage/types.ts';
import { itemTypeOf } from './items.ts';
import { publicListingsIn } from './listings.ts';
import type { PublicListing } from './public-view.ts';
import { aliasOf } from './snapshot.ts';
import { reviewVisible, sellerReputationIn } from './trust.ts';
import type { Reputation } from './trust.ts';
import { socialStatsIn } from '../../profile/service/follows.ts';

const PAGE = 20;

export interface SellerProfile {
  sellerId: string; alias: string; avatarUrl?: string; memberSince: string; isDemo?: boolean; /** Enlaces a sus redes (solo perfiles de TikTok, Instagram y YouTube). */ links?: { tiktok?: string; instagram?: string; youtube?: string }; /** Ciudad y departamento. */ location?: { city: string; region?: string };
  social: { followers: number; following: number; publications: number; isFollowing: boolean };
  reputation: { count: number; average: number; distribution: Reputation['distribution']; completedSales: number };
  active: PublicListing[];
  sold: { title: string; itemType: ItemType; quantity: number; photoUrl?: string; soldAt: string }[];
  reviews: { stars: number; comment: string; raterId: string; raterAlias: string; createdAt: string; itemTitle: string }[];
  reviewsTotal: number;
}

/**
 * Perfil público del vendedor. Solo proyecta datos aprobados: sin precios ni compradores de ventas pasadas,
 * sin contacto ni notas. Las opiniones se publican cuando ambas partes valoraron o venció el plazo.
 */
export async function getSellerProfile(store: Store, sellerId: string, now: Date, options: { reviewsOffset?: number; viewerId?: string } = {}): Promise<SellerProfile> {
  return store.tx(async tx => {
    const user = await tx.users.get(sellerId);
    if (!user) throw new NotFoundError('Criador no encontrado.');
    const rep = await sellerReputationIn(tx, sellerId);
    const rows = user.suspendedAt ? [] : (await tx.listings.list({ sellerId, status: 'publicada' })).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    const ops = (await tx.operations.list({ sellerId })).filter(op => op.status === 'completada');
    const completedAt = (op: (typeof ops)[number]) => op.history.find(entry => entry.status === 'completada')?.at ?? op.updatedAt;

    const sold: SellerProfile['sold'] = [];
    for (const op of [...ops].sort((a, b) => completedAt(b).localeCompare(completedAt(a))).slice(0, PAGE)) {
      const listing = await tx.listings.get(op.listingId);
      if (!listing) continue;
      const s = listing.snapshot, cover = s.photoIds?.[0] ?? s.photoId;
      sold.push({ title: s.title ?? s.name, itemType: itemTypeOf(listing), quantity: s.quantity ?? 1, ...(cover ? { photoUrl: `/api/media/${cover}` } : {}), soldAt: completedAt(op) });
    }

    const visible: SellerProfile['reviews'] = [];
    for (const rating of await tx.ratings.list({ rateeId: sellerId })) {
      const op = await tx.operations.get(rating.operationId);
      if (!op || op.sellerId !== sellerId || op.status !== 'completada') continue;
      if (!reviewVisible(op, await tx.ratings.list({ operationId: op.id }), now)) continue;
      const buyer = await tx.users.get(op.buyerId), listing = await tx.listings.get(op.listingId);
      visible.push({ stars: rating.stars, comment: rating.comment, raterId: op.buyerId, raterAlias: buyer ? aliasOf(buyer) : 'Comprador', createdAt: rating.createdAt, itemTitle: listing ? listing.snapshot.title ?? listing.snapshot.name : 'Compra' });
    }
    visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = Math.max(options.reviewsOffset ?? 0, 0);

    return {
      sellerId, alias: aliasOf(user), ...(user.avatarId ? { avatarUrl: `/api/media/${user.avatarId}` } : {}), memberSince: user.createdAt, ...(user.demo ? { isDemo: true } : {}), ...(user.social && Object.keys(user.social).length ? { links: user.social } : {}), ...(user.location ? { location: user.location } : {}),
      social: await socialStatsIn(tx, sellerId, options.viewerId),
      reputation: { count: rep.count, average: rep.average, distribution: rep.distribution, completedSales: rep.completed },
      active: await publicListingsIn(tx, rows, now), sold,
      reviews: visible.slice(offset, offset + PAGE), reviewsTotal: visible.length,
    };
  });
}
