import type { MediaItemRecord, PostRecord, Store, Tx } from '../../../server/storage/types.ts';
import { listingFeatures, postFeatures } from './reel-features.ts';
import { applySignals, emptyInterests } from './reel-ranking.ts';
import type { ReelInterests, Signal, SignalType } from './reel-ranking.ts';

// Aprendizaje de los gustos de cada persona a partir de lo que hace en los reels. Las reacciones (me gusta, comentario, compartir, seguir)
// se registran desde el servidor al ocurrir; el tiempo que mira cada reel y los toques en «Ver en el mercado» los informa el navegador.

export const MAX_SIGNALS_PER_BATCH = 40;

export async function interestsOf(tx: Tx, userId: string): Promise<ReelInterests> {
  const row = await tx.reelInterests.get(userId);
  return row ? { weights: row.weights, authors: row.authors, updatedAt: row.updatedAt } : emptyInterests();
}

/** Suma señales a los gustos de la persona (dentro de la transacción que la provocó). */
export async function learnIn(tx: Tx, userId: string, signals: Signal[], now: Date): Promise<void> {
  if (!signals.length) return;
  const next = applySignals(await interestsOf(tx, userId), signals, now);
  const record = { id: userId, weights: next.weights, authors: next.authors, updatedAt: next.updatedAt! };
  if (await tx.reelInterests.get(userId)) await tx.reelInterests.update(record); else await tx.reelInterests.insert(record);
}

/** Señal de una publicación del muro (o del original, si es un repost). */
export async function postSignal(tx: Tx, post: PostRecord, type: SignalType, ms?: number): Promise<Signal> {
  const original = post.sharedFromId ? await tx.posts.get(post.sharedFromId) : undefined;
  const ids = [...post.mediaIds, ...(original?.mediaIds ?? [])];
  const media = new Map<string, MediaItemRecord>();
  for (const id of ids) { const item = await tx.mediaItems.get(id); if (item) media.set(id, item); }
  return { tags: postFeatures(post, media, original), authorId: original?.authorId ?? post.authorId, type, ...(ms !== undefined ? { ms } : {}) };
}

export interface ClientSignal { key: string; type: 'view' | 'open'; ms?: number }

/** Claves cortas de los reels (`p:` + 8 caracteres del id para publicaciones, `a:` para avisos): así las listas de «ya vistos» son cortas. */
export const shortKey = (key: string): string => key.slice(0, 10);

/** Registra lo que el navegador informó (tiempo de visualización y toques en avisos). Lo que no se reconoce se ignora. */
export async function recordReelSignals(store: Store, userId: string, inputs: ClientSignal[], now: Date = new Date()): Promise<{ accepted: number }> {
  const batch = inputs.slice(0, MAX_SIGNALS_PER_BATCH).filter(item => item && typeof item.key === 'string' && /^[pa]:[0-9a-f-]{6,36}$/i.test(item.key) && (item.type === 'view' || item.type === 'open'));
  if (!batch.length) return { accepted: 0 };
  return store.tx(async tx => {
    const wanted = new Set(batch.map(item => shortKey(item.key)));
    const posts = wanted.size ? (await tx.posts.list()).filter(post => !post.hiddenAt && wanted.has(shortKey(`p:${post.id}`))) : [];
    const listings = (await tx.listings.list({ status: 'publicada' })).filter(listing => wanted.has(shortKey(`a:${listing.id}`)));
    const byKey = new Map<string, () => Promise<Signal | undefined>>();
    for (const post of posts) byKey.set(shortKey(`p:${post.id}`), () => postSignal(tx, post, 'view'));
    for (const listing of listings) byKey.set(shortKey(`a:${listing.id}`), async () => ({ tags: listingFeatures(listing), authorId: listing.sellerId, type: 'view' }));
    const signals: Signal[] = [];
    for (const item of batch) {
      const resolve = byKey.get(shortKey(item.key));
      const base = resolve ? await resolve() : undefined;
      if (!base) continue;
      if (item.type === 'open') signals.push({ ...base, type: 'open' });
      else if (typeof item.ms === 'number' && Number.isFinite(item.ms)) signals.push({ ...base, type: 'view', ms: Math.max(0, Math.min(item.ms, 600_000)) });
    }
    await learnIn(tx, userId, signals, now);
    return { accepted: signals.length };
  });
}
