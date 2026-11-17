import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import type { MediaItemRecord, PostRecord, Store, Tx } from '../../../server/storage/types.ts';
import type { Ctx, Deps } from '../../market/service/listings.ts';
import { publicListingsIn } from '../../market/service/listings.ts';
import type { PublicListing } from '../../market/service/public-view.ts';
import { aliasOf } from '../../market/service/snapshot.ts';
import { MAX_MEDIA_PER_POST, MAX_TEXT } from './media-limits.ts';
import { discardBytes, mediaUrl } from './media.ts';
import { emit } from '../../notifications/service/events.ts';
import { engagementFor } from './social.ts';
import { socialStatsIn } from './follows.ts';
import { cleanText, containsContact } from './text.ts';
import { DEMO_MARKET_LISTINGS } from '../../market/service/demo-listings.ts';
import { listingSearchText, matchesTerms, postSearchText, sampleSearchText, searchTerms } from './reel-search.ts';
import { proximityBucket } from './location.ts';
import { listingFeatures, postFeatures } from './reel-features.ts';
import { rankReels, type ReelCandidate } from './reel-ranking.ts';
import { interestsOf, learnIn, postSignal, shortKey } from './reel-signals.ts';
import { PROVIDER_LABELS, describeUnshareableLink, embedUrl, findVideoLink, parseShareableVideoLink, parseVideoLink, type VideoLink } from './video-links.ts';

// Publicaciones del perfil (el «muro»): texto, fotos y videos. Son públicas, igual que el perfil.

export { MAX_MEDIA_PER_POST, MAX_TEXT };
export const DEFAULT_PAGE = 10, MAX_PAGE = 30;

export interface PostMediaView { id: string; kind: 'image' | 'video'; mime: string; size: number; width?: number; height?: number; url: string; thumbUrl?: string; }
export interface PostEmbedView { provider: 'youtube' | 'tiktok' | 'instagram'; label: string; id: string; kind: string; url: string; embedUrl: string; aspect: 'portrait' | 'landscape' | 'square'; }
/** Contenido del reel original dentro de un repost. Si el original se borró, se ocultó o su autor fue suspendido: solo `available: false`. */
export interface SharedPostView {
  id: string; available: boolean; authorId?: string; authorAlias?: string; authorAvatarUrl?: string; authorIsDemo?: boolean;
  text?: string; createdAt?: string; media?: PostMediaView[]; embed?: PostEmbedView;
}
export interface PostView {
  id: string; authorId: string; authorAlias: string; authorAvatarUrl?: string; text: string; createdAt: string; editedAt?: string;
  authorFollowers: number; followedByViewer: boolean; authorIsDemo: boolean;
  mine: boolean; /** Solo lo ve el autor: la moderación la ocultó. */ hidden?: true; media: PostMediaView[];
  likes: number; liked: boolean; commentCount: number;
  /** Video enlazado de YouTube, TikTok o Instagram (reproductor oficial). */ embed?: PostEmbedView;
  /** Presente cuando la publicación es un reel compartido de otra persona. */ shared?: SharedPostView;
}

function embedView(embed: PostRecord['embed']): PostEmbedView | undefined {
  const link = embed ? parseVideoLink(embed.url) : null;
  if (!embed || !link || link.provider !== embed.provider || link.id !== embed.id) return undefined; // datos alterados: no se muestra
  return { provider: link.provider, label: PROVIDER_LABELS[link.provider], id: link.id, kind: link.kind, url: link.url, embedUrl: embedUrl(link), aspect: link.aspect };
}

export { containsContact };

async function mediaViews(tx: Tx, ids: string[]): Promise<PostMediaView[]> {
  const out: PostMediaView[] = [];
  for (const id of ids) {
    const item = await tx.mediaItems.get(id);
    if (!item) continue;
    const thumb = (await tx.mediaItems.list({ thumbOf: id }))[0];
    out.push({ id, kind: item.kind, mime: item.mime, size: item.size, url: mediaUrl(id), ...(item.width ? { width: item.width } : {}), ...(item.height ? { height: item.height } : {}), ...(thumb ? { thumbUrl: mediaUrl(thumb.id) } : {}) });
  }
  return out;
}

/** El original de un repost solo se muestra si sigue publicado y su autor está activo. */
async function originalOf(tx: Tx, post: PostRecord) {
  if (!post.sharedFromId) return undefined;
  const original = await tx.posts.get(post.sharedFromId);
  if (!original || original.hiddenAt) return undefined;
  const author = await tx.users.get(original.authorId);
  return author && !author.suspendedAt ? { post: original, author } : undefined;
}

async function sharedView(tx: Tx, post: PostRecord): Promise<SharedPostView | undefined> {
  if (!post.sharedFromId) return undefined;
  const found = await originalOf(tx, post);
  if (!found) return { id: post.sharedFromId, available: false };
  const { post: original, author } = found;
  return {
    id: original.id, available: true, authorId: original.authorId, authorAlias: aliasOf(author), ...(author.avatarId ? { authorAvatarUrl: mediaUrl(author.avatarId) } : {}), authorIsDemo: Boolean(author.demo),
    text: original.text, createdAt: original.createdAt, ...(embedView(original.embed) ? { embed: embedView(original.embed) } : {}),
    media: [...await mediaViews(tx, original.mediaIds), ...(original.demoImageUrl ? [{ id: `${original.id}:demo-image`, kind: 'image' as const, mime: 'image/jpeg', size: 0, url: original.demoImageUrl }] : [])],
  };
}

async function viewOf(tx: Tx, post: PostRecord, viewerId?: string): Promise<PostView> {
  const shared = await sharedView(tx, post);
  const author = await tx.users.get(post.authorId);
  const social = await socialStatsIn(tx, post.authorId, viewerId);
  return {
    id: post.id, authorId: post.authorId, authorAlias: author ? aliasOf(author) : 'Usuario', ...(author?.avatarId ? { authorAvatarUrl: mediaUrl(author.avatarId) } : {}),
    authorFollowers: social.followers, followedByViewer: social.isFollowing, authorIsDemo: Boolean(author?.demo),
    text: post.text, createdAt: post.createdAt, ...(post.editedAt ? { editedAt: post.editedAt } : {}), mine: viewerId === post.authorId,
    ...(embedView(post.embed) ? { embed: embedView(post.embed) } : {}), ...(shared ? { shared } : {}),
    ...(post.hiddenAt && viewerId === post.authorId ? { hidden: true as const } : {}), media: [...await mediaViews(tx, post.mediaIds), ...(post.demoImageUrl ? [{ id: `${post.id}:demo-image`, kind: 'image' as const, mime: 'image/jpeg', size: 0, url: post.demoImageUrl }] : [])],
    ...(await engagementFor(tx, post.id, viewerId)),
  };
}

export async function createPost(deps: Deps, ctx: Ctx, input: { text?: unknown; mediaIds?: unknown; videoUrl?: unknown }): Promise<PostView> {
  const text = cleanText(input.text, MAX_TEXT);
  let ids: string[] = [];
  if (input.mediaIds !== undefined) {
    if (!Array.isArray(input.mediaIds) || input.mediaIds.some(id => typeof id !== 'string' || !id)) throw new ValidationError('Los archivos adjuntos no son válidos.');
    ids = input.mediaIds as string[];
    if (new Set(ids).size !== ids.length) throw new ValidationError('Hay archivos repetidos.');
    if (ids.length > MAX_MEDIA_PER_POST) throw new ValidationError(`Una publicación admite como máximo ${MAX_MEDIA_PER_POST} archivos.`);
  }
  // Enlace de video: explícito (campo «videoUrl») o, si no hay archivos, el primer enlace compatible que venga en el texto.
  let embed: VideoLink | null = null;
  if (input.videoUrl !== undefined && input.videoUrl !== null && input.videoUrl !== '') {
    if (typeof input.videoUrl !== 'string') throw new ValidationError('El enlace de video no es válido.');
    embed = parseShareableVideoLink(input.videoUrl);
    if (!embed) throw new ValidationError(describeUnshareableLink(input.videoUrl));
    if (ids.length > 0) throw new ValidationError('Publica un enlace de video o archivos subidos, no ambos.');
  } else if (ids.length === 0) embed = findVideoLink(text);
  if (!text && ids.length === 0 && !embed) throw new ValidationError('Escribe algo o agrega una foto, un video o un enlace de video.');
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    await assertRate(tx, ctx.userId, 'post.create', ctx.now);
    const items: MediaItemRecord[] = [];
    for (const id of ids) {
      const item = await tx.mediaItems.get(id);
      if (!item) throw new NotFoundError('Uno de los archivos no existe. Vuelve a subirlo.');
      if (item.ownerId !== ctx.userId) throw new ForbiddenError('Uno de los archivos no es tuyo.');
      if (item.purpose !== 'post') throw new ValidationError('Ese archivo no se puede adjuntar a una publicación.');
      if (item.postId) throw new ConflictError('Uno de los archivos ya está en otra publicación.');
      items.push(item);
    }
    const at = ctx.now.toISOString(), id = randomUUID();
    const post: PostRecord = { id, authorId: ctx.userId, text, mediaIds: ids, createdAt: at, updatedAt: at, ...(embed ? { embed: { provider: embed.provider, id: embed.id, kind: embed.kind, url: embed.url } } : {}) };
    await tx.posts.insert(post);
    for (const item of items) {
      await tx.mediaItems.update({ ...item, postId: id });
      for (const thumb of await tx.mediaItems.list({ thumbOf: item.id })) await tx.mediaItems.update({ ...thumb, postId: id });
    }
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'post.create', targetType: 'post', targetId: id, detail: { media: ids.length, chars: text.length, ...(embed ? { embed: embed.provider } : {}) }, createdAt: at });
    return viewOf(tx, post, ctx.userId);
  });
}

/** Comparte en el perfil de quien llama un reel de otra persona. Se guarda solo la referencia al original (más un comentario opcional). */
export async function sharePost(deps: Deps, ctx: Ctx, sourceId: string, commentInput: unknown): Promise<PostView> {
  const text = cleanText(commentInput, MAX_TEXT);
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const picked = await tx.posts.get(sourceId);
    if (!picked || picked.hiddenAt) throw new NotFoundError('Publicación no encontrada.');
    // Compartir un repost comparte el original: nunca se forman cadenas.
    const original = picked.sharedFromId ? await tx.posts.get(picked.sharedFromId) : picked;
    const author = original && await tx.users.get(original.authorId);
    if (!original || original.hiddenAt || !author || author.suspendedAt) throw new NotFoundError('La publicación original ya no está disponible.');
    if (original.demo || author.demo) throw new ForbiddenError('Las publicaciones de muestra no se pueden compartir.');
    if (original.authorId === ctx.userId) throw new ValidationError('Esta publicación ya es tuya: no hace falta compartirla.');
    if ((await tx.posts.list({ authorId: ctx.userId })).some(row => row.sharedFromId === original.id)) throw new ConflictError('Ya compartiste este reel en tu perfil.');
    await assertRate(tx, ctx.userId, 'post.share', ctx.now);
    const at = ctx.now.toISOString(), id = randomUUID();
    const post: PostRecord = { id, authorId: ctx.userId, text, mediaIds: [], createdAt: at, updatedAt: at, sharedFromId: original.id };
    await tx.posts.insert(post);
    await learnIn(tx, ctx.userId, [await postSignal(tx, original, 'share')], ctx.now);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'post.share', targetType: 'post', targetId: id, detail: { from: original.id, chars: text.length }, createdAt: at });
    await emit(tx, { type: 'profile.post.shared', aggregateType: 'post', aggregateId: original.id, payload: { postId: original.id, sharedPostId: id, authorId: original.authorId, sharerId: ctx.userId }, dedupeKey: `post-shared:${original.id}:${ctx.userId}:${id}`, now: ctx.now });
    return viewOf(tx, post, ctx.userId);
  });
}

export interface PostPage { items: PostView[]; nextBefore?: string; }
export type ReelFeedItem =
  | { kind: 'post'; id: string; createdAt: string; post: PostView }
  | { kind: 'advertisement'; id: string; createdAt: string; listing: PublicListing; sellerAvatarUrl?: string; sellerFollowers: number; followedByViewer: boolean }
  | { kind: 'sample-advertisement'; id: string; createdAt: string; listing: typeof DEMO_MARKET_LISTINGS[number] };
export interface ReelFeedPage { items: ReelFeedItem[]; nextBefore?: string; }

function normalizeTag(value: string) {
  return value.replace(/^#/, '').normalize('NFKC').toLocaleLowerCase('es-CO');
}

function hasTag(text: string, tag: string) {
  return Array.from(text.matchAll(/#([\p{L}\p{N}_]+)/gu), match => normalizeTag(match[1])).includes(tag);
}

/** En los feeds públicos un repost solo sale si su original sigue publicado y con autor activo. */
function originalShown(byId: Map<string, PostRecord>, authors: Map<string, unknown>, post: PostRecord): boolean {
  if (!post.sharedFromId) return true;
  const original = byId.get(post.sharedFromId);
  return Boolean(original && !original.hiddenAt && authors.has(original.authorId));
}

/** Muro público de un usuario, de la más nueva a la más vieja. `before` es el cursor opaco devuelto como `nextBefore`. */
export async function listPosts(store: Store, authorId: string, options: { before?: string; limit?: number }, viewerId?: string): Promise<PostPage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1), MAX_PAGE);
  const [beforeAt, beforeId] = (options.before ?? '').split('|');
  return store.tx(async tx => {
    if (!(await tx.users.get(authorId))) throw new NotFoundError('Usuario no encontrado.');
    const rows = (await tx.posts.list({ authorId }))
      .filter(post => !post.hiddenAt || viewerId === authorId)
      .filter(post => !beforeAt || post.createdAt < beforeAt || (post.createdAt === beforeAt && post.id < (beforeId ?? '')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await Promise.all(page.map(post => viewOf(tx, post, viewerId))), ...(rows.length > limit && last ? { nextBefore: `${last.createdAt}|${last.id}` } : {}) };
  });
}

/** Feed público global: publicaciones visibles de todos los perfiles, con cursor cronológico. */
export async function listPublicPosts(store: Store, options: { before?: string; limit?: number; tag?: string }, viewerId?: string): Promise<PostPage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1), MAX_PAGE);
  const tag = options.tag ? normalizeTag(options.tag.slice(0, 50)) : '';
  const [beforeAt, beforeId] = (options.before ?? '').split('|');
  return store.tx(async tx => {
    const authors = new Map((await tx.users.list()).filter(user => !user.suspendedAt).map(user => [user.id, user]));
    const all = await tx.posts.list(), byId = new Map(all.map(post => [post.id, post]));
    const rows = all
      .filter(post => !post.hiddenAt && authors.has(post.authorId) && originalShown(byId, authors, post))
      .filter(post => !tag || hasTag(post.text, tag))
      .filter(post => !beforeAt || post.createdAt < beforeAt || (post.createdAt === beforeAt && post.id < (beforeId ?? '')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await Promise.all(page.map(post => viewOf(tx, post, viewerId))), ...(rows.length > limit && last ? { nextBefore: `${last.createdAt}|${last.id}` } : {}) };
  });
}

/** Reels comunitarios mezclados con avisos de venta; cursor estable entre ambos tipos. */
/**
 * Reels comunitarios mezclados con avisos de venta.
 *  · `chronological` (por defecto): lo más nuevo primero, con lo cercano por delante si la persona dijo dónde está. Es el orden de las búsquedas y etiquetas.
 *  · `foryou`: orden «Para ti» (reciente, tendencia, cercano, seguidos y gustos aprendidos, con variedad). La página se pide con `seen` (los ya vistos)
 *    y `seed` (cambia en cada visita), así no hace falta un cursor y nunca se repite nada.
 */
export async function listPublicReels(store: Store, options: { before?: string; limit?: number; tag?: string; q?: string; mode?: 'chronological' | 'foryou'; seen?: string[]; seed?: string }, viewerId: string): Promise<ReelFeedPage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1), MAX_PAGE);
  const tag = options.tag ? normalizeTag(options.tag.slice(0, 50)) : '';
  const terms = searchTerms(options.q ?? '');
  const cursor = (options.before ?? '').split('|');
  const now = new Date();
  return store.tx(async tx => {
    const authors = new Map((await tx.users.list()).filter(user => !user.suspendedAt).map(user => [user.id, user]));
    // Con ubicación conocida, lo de mi ciudad sale primero, luego lo de mi departamento y después lo demás (dentro de cada grupo, lo más nuevo primero).
    const here = (await tx.users.get(viewerId))?.location;
    const ranked = Boolean(here?.city);
    const [beforeBucket, beforeAt, beforeKey] = cursor.length >= 3 ? [Number(cursor[0]) || 0, cursor[1], cursor[2]] : [0, cursor[0], cursor[1]];
    const all = await tx.posts.list(), byId = new Map(all.map(post => [post.id, post]));
    const posts = all
      .filter(post => !post.hiddenAt && authors.has(post.authorId) && originalShown(byId, authors, post) && (!tag || hasTag(post.text, tag)) && matchesTerms(postSearchText(post, authors.get(post.authorId)?.displayName ?? ''), terms))
      .map(post => ({ kind: 'post' as const, id: post.id, at: post.createdAt, key: `p:${post.id}`, bucket: proximityBucket(here, authors.get(post.authorId)?.location), post }));
    const ads = tag ? [] : (await tx.listings.list({ status: 'publicada' }))
      .filter(listing => authors.has(listing.sellerId) && listing.publishedAt && matchesTerms(listingSearchText(listing, authors.get(listing.sellerId)?.displayName ?? ''), terms))
      .map(listing => ({ kind: 'advertisement' as const, id: listing.id, at: listing.publishedAt!, key: `a:${listing.id}`, bucket: proximityBucket(here, authors.get(listing.sellerId)?.location ?? listing.snapshot.deliveryZone), listing }));
    const demoAds = !tag && [...authors.values()].some(user => user.demo)
      ? DEMO_MARKET_LISTINGS.filter(listing => matchesTerms(sampleSearchText(listing), terms)).map((listing, index) => ({ kind: 'sample-advertisement' as const, id: listing.id, at: `2026-10-${String(18 - index).padStart(2, '0')}T12:00:00.000Z`, key: `s:${listing.id}`, bucket: (ranked ? 2 : 0) as 0 | 1 | 2, listing }))
      : [];
    const order = (a: { bucket: number; at: string; key: string }, b: { bucket: number; at: string; key: string }) => a.bucket - b.bucket || b.at.localeCompare(a.at) || b.key.localeCompare(a.key);
    const rows = [...posts, ...ads, ...demoAds]
      .map(row => (ranked ? row : { ...row, bucket: 0 as 0 | 1 | 2 }))
      .filter(row => !beforeAt || order(row, { bucket: ranked ? beforeBucket : 0, at: beforeAt, key: beforeKey ?? '' }) > 0)
      .sort(order);
    let page = rows.slice(0, limit);
    const last = page[page.length - 1];
    let more = rows.length > limit && Boolean(last);
    if (options.mode === 'foryou' && !tag && !terms.length) {
      const media = new Map((await tx.mediaItems.list()).map(item => [item.id, item]));
      const likeCount = new Map<string, number>(), commentCount = new Map<string, number>(), mine = new Set<string>();
      for (const like of await tx.postLikes.list()) { likeCount.set(like.postId, (likeCount.get(like.postId) ?? 0) + 1); if (like.userId === viewerId) mine.add(like.postId); }
      for (const comment of await tx.postComments.list()) if (!comment.hiddenAt && !comment.deletedAt) commentCount.set(comment.postId, (commentCount.get(comment.postId) ?? 0) + 1);
      const following = new Set((await tx.follows.list({ followerId: viewerId })).map(row => row.followingId));
      const candidates = [...posts, ...ads, ...demoAds].map((row): ReelCandidate => {
        if (row.kind === 'post') {
          const original = row.post.sharedFromId ? byId.get(row.post.sharedFromId) : undefined;
          const authorId = original?.authorId ?? row.post.authorId;
          return { key: row.key, at: row.at, authorId, tags: postFeatures(row.post, media, original), likes: likeCount.get(row.id) ?? 0, comments: commentCount.get(row.id) ?? 0, bucket: ranked ? row.bucket : 0, followed: following.has(authorId) || following.has(row.post.authorId), liked: mine.has(row.id), isAd: false };
        }
        if (row.kind === 'advertisement') return { key: row.key, at: row.at, authorId: row.listing.sellerId, tags: listingFeatures(row.listing), likes: 0, comments: 0, bucket: ranked ? row.bucket : 0, followed: following.has(row.listing.sellerId), liked: false, isAd: true };
        return { key: row.key, at: row.at, authorId: row.listing.sellerId, tags: ['type:mercado', 'species:gallinas'], likes: 0, comments: 0, bucket: 2, followed: false, liked: false, isAd: true };
      });
      const seen = new Set((options.seen ?? []).slice(-200)), seenKeys = new Set(candidates.filter(item => seen.has(shortKey(item.key))).map(item => item.key));
      const recent = (options.seen ?? []).slice(-3).map(short => candidates.find(item => shortKey(item.key) === short)).filter((item): item is ReelCandidate => Boolean(item));
      const chosen = rankReels(candidates, { now, seed: options.seed ?? '', interests: await interestsOf(tx, viewerId), limit, exclude: seenKeys, recent });
      const byKey = new Map([...posts, ...ads, ...demoAds].map(row => [row.key, row]));
      page = chosen.map(item => byKey.get(item.key)!);
      more = candidates.length - seenKeys.size > limit;
    }
    const listingRows = page.filter((row): row is typeof ads[number] => row.kind === 'advertisement').map(row => row.listing);
    const listings = new Map((await publicListingsIn(tx, listingRows, now)).map(listing => [listing.id, listing]));
    const items: ReelFeedItem[] = [];
    for (const row of page) {
      if (row.kind === 'post') items.push({ kind: 'post', id: row.id, createdAt: row.at, post: await viewOf(tx, row.post, viewerId) });
      else if (row.kind === 'advertisement') {
        const seller = authors.get(row.listing.sellerId), social = await socialStatsIn(tx, row.listing.sellerId, viewerId), listing = listings.get(row.id);
        if (listing) items.push({ kind: 'advertisement', id: row.id, createdAt: row.at, listing, ...(seller?.avatarId ? { sellerAvatarUrl: mediaUrl(seller.avatarId) } : {}), sellerFollowers: social.followers, followedByViewer: social.isFollowing });
      } else items.push({ kind: 'sample-advertisement', id: row.id, createdAt: row.at, listing: row.listing });
    }
    if (options.mode === 'foryou' && !tag && !terms.length) return { items, ...(more ? { nextBefore: 'more' } : {}) };
    return { items, ...(more && last ? { nextBefore: ranked ? `${last.bucket}|${last.at}|${last.key}` : `${last.at}|${last.key}` } : {}) };
  });
}

async function ownPost(tx: Tx, id: string, userId: string): Promise<PostRecord> {
  const post = await tx.posts.get(id);
  if (!post) throw new NotFoundError('Publicación no encontrada.');
  if (post.authorId !== userId) throw new ForbiddenError('Esta publicación no es tuya.');
  return post;
}

export async function editPost(deps: Deps, ctx: Ctx, id: string, textInput: unknown): Promise<PostView> {
  const text = cleanText(textInput, MAX_TEXT);
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const post = await ownPost(tx, id, ctx.userId);
    if (post.hiddenAt) throw new ForbiddenError('La moderación ocultó esta publicación y no se puede editar.');
    if (!text && post.mediaIds.length === 0 && !post.embed && !post.sharedFromId) throw new ValidationError('Una publicación sin fotos ni videos necesita texto.');
    const next: PostRecord = { ...post, text, updatedAt: ctx.now.toISOString(), editedAt: ctx.now.toISOString() };
    await tx.posts.update(next);
    return viewOf(tx, next, ctx.userId);
  });
}

/** Borra la publicación y sus archivos (fotos, videos y miniaturas). */
export async function deletePost(deps: Deps, ctx: Ctx, id: string): Promise<void> {
  const doomed: string[] = [];
  await deps.store.tx(async tx => {
    const post = await ownPost(tx, id, ctx.userId);
    for (const mediaId of post.mediaIds) {
      for (const thumb of await tx.mediaItems.list({ thumbOf: mediaId })) { await tx.mediaItems.remove(thumb.id); doomed.push(thumb.id); }
      if (await tx.mediaItems.get(mediaId)) { await tx.mediaItems.remove(mediaId); doomed.push(mediaId); }
    }
    for (const like of await tx.postLikes.list({ postId: id })) await tx.postLikes.remove(like.id);
    for (const comment of await tx.postComments.list({ postId: id })) await tx.postComments.remove(comment.id);
    await tx.posts.remove(id);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'post.delete', targetType: 'post', targetId: id, detail: { media: post.mediaIds.length }, createdAt: ctx.now.toISOString() });
  });
  await discardBytes(deps, doomed);
}

/** Una publicación (para los enlaces de las notificaciones). Las ocultas por moderación solo las ve su autor. */
export async function getPost(store: Store, postId: string, viewerId?: string): Promise<PostView> {
  return store.tx(async tx => {
    const post = await tx.posts.get(postId);
    if (!post || (post.hiddenAt && viewerId !== post.authorId)) throw new NotFoundError('Publicación no encontrada.');
    return viewOf(tx, post, viewerId);
  });
}
