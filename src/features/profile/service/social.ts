import { learnIn, postSignal } from './reel-signals.ts';
import { randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import type { PostCommentRecord, PostRecord, Store, Tx } from '../../../server/storage/types.ts';
import type { Ctx } from '../../market/service/listings.ts';
import { aliasOf } from '../../market/service/snapshot.ts';
import { emit } from '../../notifications/service/events.ts';
import { COMMENT_MAX } from './media-limits.ts';
import { mediaUrl } from './media.ts';
import { cleanText } from './text.ts';

// Me gusta y comentarios con hilos de las publicaciones del perfil. Hilos de dos niveles: comentario y respuestas.
// Responder a una respuesta la une al comentario principal (como Facebook) y guarda a quién se respondió.

export { COMMENT_MAX };
export const COMMENT_PAGE = 10, MAX_PAGE = 30, REPLY_PREVIEW = 2, LIKERS_PAGE = 50;

export interface Engagement { likes: number; liked: boolean; commentCount: number; }
export interface CommentView {
  id: string; postId: string; parentId?: string; authorId: string; authorAlias: string; authorAvatarUrl?: string;
  replyTo?: { id: string; alias: string }; text: string; createdAt: string; editedAt?: string;
  mine: boolean; canDelete: boolean; /** Solo lo ve su autor: la moderación lo ocultó. */ hidden?: true;
  /** Borrado con respuestas: queda el hueco para no perder el hilo. */ deleted?: true;
  replies?: CommentView[]; repliesTotal: number;
}
export interface CommentPage { items: CommentView[]; nextAfter?: string; total: number; }

async function visiblePost(tx: Tx, postId: string): Promise<PostRecord> {
  const post = await tx.posts.get(postId);
  if (!post || post.hiddenAt) throw new NotFoundError('Publicación no encontrada.');
  return post;
}

/** Comentarios que cuentan: ni borrados ni ocultos por moderación. */
const counts = (comment: PostCommentRecord) => !comment.deletedAt && !comment.hiddenAt;

export async function engagementFor(tx: Tx, postId: string, viewerId?: string): Promise<Engagement> {
  const likes = await tx.postLikes.list({ postId });
  const comments = await tx.postComments.list({ postId });
  return { likes: likes.length, liked: viewerId ? likes.some(row => row.userId === viewerId) : false, commentCount: comments.filter(counts).length };
}

// ---------------- Me gusta ----------------

/** Pone o quita el «me gusta». Es idempotente: repetirlo no duplica ni resta de más. Avisa al autor solo la primera vez. */
export async function setLike(store: Store, ctx: Ctx, postId: string, liked: boolean): Promise<{ liked: boolean; likes: number }> {
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const post = await visiblePost(tx, postId);
    if (post.demo) throw new ForbiddenError('Las publicaciones de muestra son de solo lectura.');
    const id = `${postId}:${ctx.userId}`, existing = await tx.postLikes.get(id);
    if (liked && !existing) {
      await tx.postLikes.insert({ id, postId, userId: ctx.userId, createdAt: ctx.now.toISOString() });
      await learnIn(tx, ctx.userId, [await postSignal(tx, post, 'like')], ctx.now);
      if (post.authorId !== ctx.userId) await emit(tx, { type: 'profile.post.liked', aggregateType: 'post', aggregateId: postId, payload: { postId, authorId: post.authorId, likerId: ctx.userId }, dedupeKey: `post-liked:${postId}:${ctx.userId}`, now: ctx.now });
    }
    if (!liked && existing) await tx.postLikes.remove(id);
    return { liked, likes: (await tx.postLikes.list({ postId })).length };
  });
}

export async function listLikers(store: Store, postId: string): Promise<{ total: number; users: { id: string; alias: string; avatarUrl?: string }[] }> {
  return store.tx(async tx => {
    await visiblePost(tx, postId);
    const rows = (await tx.postLikes.list({ postId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const users = [];
    for (const row of rows.slice(0, LIKERS_PAGE)) {
      const user = await tx.users.get(row.userId);
      if (user) users.push({ id: user.id, alias: aliasOf(user), ...(user.avatarId ? { avatarUrl: mediaUrl(user.avatarId) } : {}) });
    }
    return { total: rows.length, users };
  });
}

// ---------------- Comentarios ----------------

async function viewOf(tx: Tx, comment: PostCommentRecord, post: PostRecord, viewerId?: string): Promise<CommentView> {
  const author = await tx.users.get(comment.authorId);
  const mine = viewerId === comment.authorId;
  let replyTo: CommentView['replyTo'];
  if (comment.replyToUserId) { const target = await tx.users.get(comment.replyToUserId); replyTo = { id: comment.replyToUserId, alias: target ? aliasOf(target) : 'Usuario' }; }
  return {
    id: comment.id, postId: comment.postId, ...(comment.parentId ? { parentId: comment.parentId } : {}), authorId: comment.authorId,
    authorAlias: author ? aliasOf(author) : 'Usuario', ...(author?.avatarId ? { authorAvatarUrl: mediaUrl(author.avatarId) } : {}),
    ...(replyTo ? { replyTo } : {}), text: comment.deletedAt ? '' : comment.text, createdAt: comment.createdAt, ...(comment.editedAt ? { editedAt: comment.editedAt } : {}),
    mine, canDelete: Boolean(viewerId) && (mine || viewerId === post.authorId) && !comment.deletedAt,
    ...(comment.hiddenAt && mine ? { hidden: true as const } : {}), ...(comment.deletedAt ? { deleted: true as const } : {}), repliesTotal: 0,
  };
}

const shows = (comment: PostCommentRecord, viewerId?: string) => !comment.deletedAt && (!comment.hiddenAt || comment.authorId === viewerId);
const byTime = (a: PostCommentRecord, b: PostCommentRecord) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export async function addComment(store: Store, ctx: Ctx, postId: string, input: { text?: unknown; parentId?: unknown }): Promise<CommentView> {
  const text = cleanText(input.text, COMMENT_MAX);
  if (!text) throw new ValidationError('Escribe un comentario.');
  if (input.parentId !== undefined && input.parentId !== null && (typeof input.parentId !== 'string' || !input.parentId)) throw new ValidationError('El comentario al que respondes no es válido.');
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    await assertRate(tx, ctx.userId, 'comment.create', ctx.now);
    const post = await visiblePost(tx, postId);
    if (post.demo) throw new ForbiddenError('Las publicaciones de muestra son de solo lectura.');
    let parentId: string | undefined, replyToUserId: string | undefined;
    if (typeof input.parentId === 'string') {
      const parent = await tx.postComments.get(input.parentId);
      if (!parent || parent.deletedAt || parent.hiddenAt) throw new NotFoundError('El comentario al que respondes ya no existe.');
      if (parent.postId !== postId) throw new ValidationError('Ese comentario es de otra publicación.');
      parentId = parent.parentId ?? parent.id; replyToUserId = parent.authorId;
    }
    const id = randomUUID(), at = ctx.now.toISOString();
    const record: PostCommentRecord = { id, postId, authorId: ctx.userId, text, createdAt: at, ...(parentId ? { parentId, replyToUserId } : {}) };
    await tx.postComments.insert(record);
    await learnIn(tx, ctx.userId, [await postSignal(tx, post, 'comment')], ctx.now);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'comment.create', targetType: 'post', targetId: postId, detail: { commentId: id, reply: Boolean(parentId) }, createdAt: at });
    if (parentId) {
      if (replyToUserId && replyToUserId !== ctx.userId) await emit(tx, { type: 'profile.comment.replied', aggregateType: 'post', aggregateId: postId, payload: { commentId: id, postId, authorId: post.authorId, toUserId: replyToUserId }, dedupeKey: `comment-replied:${id}`, now: ctx.now });
    } else if (post.authorId !== ctx.userId) {
      await emit(tx, { type: 'profile.post.commented', aggregateType: 'post', aggregateId: postId, payload: { commentId: id, postId, authorId: post.authorId }, dedupeKey: `post-commented:${id}`, now: ctx.now });
    }
    return viewOf(tx, record, post, ctx.userId);
  });
}

/** Comentarios principales de la publicación, del más viejo al más nuevo. Cada uno trae una vista previa de sus respuestas. */
export async function listComments(store: Store, postId: string, options: { after?: string; limit?: number }, viewerId?: string): Promise<CommentPage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? COMMENT_PAGE) || COMMENT_PAGE, 1), MAX_PAGE);
  const [afterAt, afterId] = (options.after ?? '').split('|');
  return store.tx(async tx => {
    const post = await visiblePost(tx, postId);
    const all = await tx.postComments.list({ postId });
    const repliesOf = (id: string) => all.filter(row => row.parentId === id && shows(row, viewerId)).sort(byTime);
    // Un comentario principal borrado solo se muestra si aún tiene respuestas visibles (para no perder el hilo).
    const top = all.filter(row => !row.parentId && (row.deletedAt ? repliesOf(row.id).length > 0 : shows(row, viewerId))).sort(byTime);
    const eligible = top.filter(row => !afterAt || row.createdAt > afterAt || (row.createdAt === afterAt && row.id > (afterId ?? '')));
    const page = eligible.slice(0, limit), last = page[page.length - 1];
    const items: CommentView[] = [];
    for (const row of page) {
      const replies = repliesOf(row.id), view = await viewOf(tx, row, post, viewerId);
      view.repliesTotal = replies.length;
      view.replies = await Promise.all(replies.slice(0, REPLY_PREVIEW).map(reply => viewOf(tx, reply, post, viewerId)));
      items.push(view);
    }
    return { items, total: top.length, ...(eligible.length > limit && last ? { nextAfter: `${last.createdAt}|${last.id}` } : {}) };
  });
}

export async function listReplies(store: Store, commentId: string, viewerId?: string): Promise<CommentView[]> {
  return store.tx(async tx => {
    const root = await tx.postComments.get(commentId);
    if (!root || root.parentId) throw new NotFoundError('Comentario no encontrado.');
    const post = await visiblePost(tx, root.postId);
    const replies = (await tx.postComments.list({ postId: root.postId })).filter(row => row.parentId === commentId && shows(row, viewerId)).sort(byTime);
    return Promise.all(replies.map(reply => viewOf(tx, reply, post, viewerId)));
  });
}

export async function editComment(store: Store, ctx: Ctx, commentId: string, textInput: unknown): Promise<CommentView> {
  const text = cleanText(textInput, COMMENT_MAX);
  if (!text) throw new ValidationError('El comentario no puede quedar vacío. Para quitarlo, elimínalo.');
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const comment = await tx.postComments.get(commentId);
    if (!comment || comment.deletedAt) throw new NotFoundError('Comentario no encontrado.');
    if (comment.authorId !== ctx.userId) throw new ForbiddenError('Este comentario no es tuyo.');
    if (comment.hiddenAt) throw new ForbiddenError('La moderación ocultó este comentario y no se puede editar.');
    const post = await visiblePost(tx, comment.postId);
    const next: PostCommentRecord = { ...comment, text, editedAt: ctx.now.toISOString() };
    await tx.postComments.update(next);
    return viewOf(tx, next, post, ctx.userId);
  });
}

/** Lo borra su autor o la dueña de la publicación. Con respuestas queda un hueco («comentario eliminado»); sin respuestas desaparece. */
export async function deleteComment(store: Store, ctx: Ctx, commentId: string): Promise<void> {
  await store.tx(async tx => {
    const comment = await tx.postComments.get(commentId);
    if (!comment || comment.deletedAt) throw new NotFoundError('Comentario no encontrado.');
    const post = await tx.posts.get(comment.postId);
    if (comment.authorId !== ctx.userId && post?.authorId !== ctx.userId) throw new ForbiddenError('Solo quien escribió el comentario o la dueña de la publicación pueden borrarlo.');
    const hasReplies = !comment.parentId && (await tx.postComments.list({ postId: comment.postId })).some(row => row.parentId === commentId && !row.deletedAt);
    if (hasReplies) await tx.postComments.update({ ...comment, text: '', deletedAt: ctx.now.toISOString() });
    else await tx.postComments.remove(commentId);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'comment.delete', targetType: 'post', targetId: comment.postId, detail: { commentId, byPostOwner: comment.authorId !== ctx.userId }, createdAt: ctx.now.toISOString() });
  });
}
