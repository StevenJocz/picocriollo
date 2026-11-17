import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import { requireStaff } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import type { ListingRecord, ReportRecord, Store, Tx } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import type { Ctx } from './listings.ts';
import { pushHistory, releaseOperationLocks } from './operations.ts';
import { aliasOf } from './snapshot.ts';
import { releaseLocks } from './locks.ts';

/** Con tantas denuncias abiertas de cuentas distintas, una publicación sin ofertas se pausa para revisión. */
export const AUTO_PAUSE_REPORTERS = 3;
export type TargetType = ReportRecord['targetType'];

const text = (value: unknown, label: string, min: number, max: number): string => {
  if (typeof value !== 'string' || value.trim().length < min) throw new ValidationError(`${label}: escribe al menos ${min} caracteres.`);
  if (value.length > max) throw new ValidationError(`${label} supera ${max} caracteres.`);
  return value.trim();
};
async function audit(tx: Tx, actorId: string, action: string, targetType: string, targetId: string, detail: Record<string, unknown>, now: Date) {
  await tx.audit.insert({ id: randomUUID(), actorId, action, targetType, targetId, detail, createdAt: now.toISOString() });
}

/** Denuncia de una publicación, un usuario o un mensaje. Una denuncia abierta por persona y objetivo. */
export async function createReport(store: Store, ctx: Ctx, input: { targetType: unknown; targetId: unknown; reason: unknown }): Promise<ReportRecord> {
  const targetType = input.targetType as TargetType;
  if (!['listing', 'user', 'message', 'post', 'comment'].includes(String(targetType))) throw new ValidationError('Tipo de denuncia no válido.');
  const targetId = text(input.targetId, 'El objetivo', 1, 120), reason = text(input.reason, 'El motivo', 10, 500);
  return store.tx(async tx => {
    await assertRate(tx, ctx.userId, 'report.create', ctx.now);
    if (targetType === 'listing') {
      const listing = await tx.listings.get(targetId);
      if (!listing || listing.status === 'borrador') throw new NotFoundError('Publicación no encontrada.');
      if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes denunciar tu propia publicación.');
    } else if (targetType === 'user') {
      if (targetId === ctx.userId) throw new ForbiddenError('No puedes denunciarte a ti mismo.');
      if (!(await tx.users.get(targetId))) throw new NotFoundError('Usuario no encontrado.');
    } else if (targetType === 'comment') {
      const comment = await tx.postComments.get(targetId);
      if (!comment || comment.deletedAt || comment.hiddenAt) throw new NotFoundError('Comentario no encontrado.');
      if (comment.authorId === ctx.userId) throw new ForbiddenError('No puedes denunciar tu propio comentario.');
    } else if (targetType === 'post') {
      const post = await tx.posts.get(targetId);
      if (!post || post.hiddenAt) throw new NotFoundError('Publicación no encontrada.');
      if (post.authorId === ctx.userId) throw new ForbiddenError('No puedes denunciar tu propia publicación.');
    } else {
      const message = await tx.messages.get(targetId);
      const thread = message ? await tx.threads.get(message.threadId) : undefined;
      if (!message || !thread || !thread.participants.includes(ctx.userId)) throw new NotFoundError('Mensaje no encontrado.');
      if (message.senderId === ctx.userId) throw new ForbiddenError('No puedes denunciar tu propio mensaje.');
    }
    if ((await tx.reports.list({ targetId })).some(row => row.reporterId === ctx.userId && ['abierta', 'en_revision'].includes(row.status))) throw new ConflictError('Ya tienes una denuncia abierta sobre esto.');
    const at = ctx.now.toISOString();
    const report: ReportRecord = { id: randomUUID(), targetType, targetId, reporterId: ctx.userId, reason, status: 'abierta', createdAt: at, updatedAt: at };
    await tx.reports.insert(report);
    await audit(tx, ctx.userId, 'report.create', targetType, targetId, { reportId: report.id }, ctx.now);
    await emit(tx, { type: 'moderation.report.created', aggregateType: 'report', aggregateId: report.id, payload: { reportId: report.id, reporterId: ctx.userId }, dedupeKey: `report:${report.id}`, now: ctx.now });
    if (targetType === 'listing') await autoPause(tx, targetId, ctx.now);
    return report;
  });
}

async function autoPause(tx: Tx, listingId: string, now: Date) {
  const listing = await tx.listings.get(listingId);
  if (!listing || listing.status !== 'publicada') return;
  const reporters = new Set((await tx.reports.list({ targetId: listingId })).filter(row => row.status === 'abierta').map(row => row.reporterId));
  if (reporters.size < AUTO_PAUSE_REPORTERS) return;
  if ((await tx.bids.list({ listingId })).some(bid => bid.status === 'valida')) return; // una subasta con ofertas solo la modifica una persona moderadora
  await tx.listings.update({ ...listing, status: 'pausada', updatedAt: now.toISOString(), version: listing.version + 1 });
  await audit(tx, 'sistema', 'moderation.auto_pause', 'listing', listingId, { reporters: reporters.size }, now);
  await emit(tx, { type: 'moderation.listing.paused', aggregateType: 'listing', aggregateId: listingId, payload: { listingId, note: 'Recibió varias denuncias y quedó en revisión.' }, dedupeKey: `mod-paused:${listingId}:auto:${now.toISOString()}`, now });
}

export interface ReportView { id: string; targetType: TargetType; targetId: string; reason: string; status: ReportRecord['status']; resolution?: string; createdAt: string; reporter: string; target: string; sameTargetReports: number; }

export async function listReports(store: Store, staffId: string, status?: string): Promise<ReportView[]> {
  return store.tx(async tx => {
    await requireStaff(tx, staffId);
    const all = await tx.reports.list();
    const rows = all.filter(row => !status || status === 'todas' || row.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out: ReportView[] = [];
    for (const row of rows) {
      const reporter = await tx.users.get(row.reporterId);
      let target = row.targetId;
      if (row.targetType === 'listing') { const l = await tx.listings.get(row.targetId); target = l ? `«${l.snapshot.name}» (${l.status})` : 'Publicación eliminada'; }
      else if (row.targetType === 'user') { const u = await tx.users.get(row.targetId); target = u ? `${aliasOf(u)}${u.suspendedAt ? ' · con restricciones' : ''}` : 'Usuario eliminado'; }
      else if (row.targetType === 'comment') { const c = await tx.postComments.get(row.targetId); target = c ? `Comentario: «${c.text.slice(0, 120)}»${c.hiddenAt ? ' (oculto)' : ''}` : 'Comentario eliminado'; }
      else if (row.targetType === 'post') { const p = await tx.posts.get(row.targetId); target = p ? `Publicación del perfil: «${p.text.slice(0, 120) || `${p.mediaIds.length} archivo(s)`}»${p.hiddenAt ? ' (oculta)' : ''}` : 'Publicación eliminada'; }
      else { const m = await tx.messages.get(row.targetId); target = m ? `Mensaje: «${m.body.slice(0, 120)}»${m.hidden ? ' (oculto)' : ''}` : 'Mensaje eliminado'; }
      out.push({ id: row.id, targetType: row.targetType, targetId: row.targetId, reason: row.reason, status: row.status, ...(row.resolution ? { resolution: row.resolution } : {}), createdAt: row.createdAt, reporter: reporter ? aliasOf(reporter) : 'Usuario', target, sameTargetReports: all.filter(item => item.targetId === row.targetId).length });
    }
    return out;
  });
}

export type ListingAction = 'pause' | 'reject' | 'withdraw' | 'restore';

async function applyListingAction(tx: Tx, listing: ListingRecord, action: ListingAction, actorId: string, note: string, now: Date) {
  const at = now.toISOString();
  if (action === 'restore') {
    if (listing.status !== 'pausada') throw new ConflictError('Solo se reanuda una publicación pausada.');
    await tx.listings.update({ ...listing, status: 'publicada', updatedAt: at, version: listing.version + 1 });
    await emit(tx, { type: 'moderation.listing.restored', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, note }, dedupeKey: `mod-restored:${listing.id}:${at}`, now });
  } else if (action === 'pause') {
    if (listing.status !== 'publicada') throw new ConflictError('Solo se pausa una publicación activa.');
    await tx.listings.update({ ...listing, status: 'pausada', updatedAt: at, version: listing.version + 1 });
    await emit(tx, { type: 'moderation.listing.paused', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, note }, dedupeKey: `mod-paused:${listing.id}:${at}`, now });
  } else {
    if (!['publicada', 'pausada'].includes(listing.status)) throw new ConflictError('Esta publicación ya no se puede retirar por moderación.');
    const bids = listing.kind === 'auction' ? await tx.bids.list({ listingId: listing.id }) : [];
    await releaseLocks(tx, listing.id, now);
    for (const bid of bids) await tx.bids.update({ ...bid, status: 'no_ganadora' });
    const rejected = action === 'reject';
    await tx.listings.update({ ...listing, status: rejected ? 'rechazada' : 'retirada', closedReason: rejected ? 'rechazada_por_moderacion' : 'retirada_por_moderacion', updatedAt: at, version: listing.version + 1 });
    await emit(tx, { type: rejected ? 'moderation.listing.rejected' : 'moderation.listing.withdrawn', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, note }, dedupeKey: `mod-${action}:${listing.id}`, now });
    if (bids.length) await emit(tx, { type: 'market.auction.cancelled', aggregateType: 'listing', aggregateId: listing.id, payload: { listingId: listing.id, bidderIds: [...new Set(bids.map(bid => bid.bidderId))], reason: 'La publicación fue retirada por moderación.' }, dedupeKey: `auction-cancelled:${listing.id}`, now });
  }
  await audit(tx, actorId, `moderation.listing.${action}`, 'listing', listing.id, { note }, now);
}

export async function moderateListing(store: Store, ctx: Ctx, listingId: string, action: ListingAction, noteInput: unknown): Promise<void> {
  if (!['pause', 'reject', 'withdraw', 'restore'].includes(action)) throw new ValidationError('Acción de moderación no válida.');
  const note = text(noteInput, 'La nota de moderación', 5, 500);
  await store.tx(async tx => {
    await requireStaff(tx, ctx.userId);
    const listing = await tx.listings.get(listingId);
    if (!listing) throw new NotFoundError('Publicación no encontrada.');
    if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes moderar tus propias publicaciones.');
    await applyListingAction(tx, listing, action, ctx.userId, note, ctx.now);
  });
}

export type ReportAction = 'dismiss' | ListingAction | 'hide' | 'warn' | 'suspend' | 'unsuspend';
const ALLOWED: Record<TargetType, ReportAction[]> = { listing: ['dismiss', 'pause', 'reject', 'withdraw', 'restore'], message: ['dismiss', 'hide'], post: ['dismiss', 'hide'], comment: ['dismiss', 'hide'], user: ['dismiss', 'warn', 'suspend', 'unsuspend'] };

/** Resuelve una denuncia con una acción explícita. Toda decisión queda en la auditoría y se cierran las denuncias gemelas. */
export async function resolveReport(store: Store, ctx: Ctx, reportId: string, input: { action: unknown; note: unknown }): Promise<ReportRecord> {
  const action = input.action as ReportAction, note = text(input.note, 'La nota de resolución', 5, 500);
  return store.tx(async tx => {
    await requireStaff(tx, ctx.userId);
    const report = await tx.reports.get(reportId);
    if (!report) throw new NotFoundError('Denuncia no encontrada.');
    if (!ALLOWED[report.targetType].includes(action)) throw new ValidationError('Esa acción no aplica a este tipo de denuncia.');
    if (report.reporterId === ctx.userId) throw new ForbiddenError('No puedes resolver una denuncia que hiciste tú.');
    const at = ctx.now.toISOString();
    if (action !== 'dismiss') {
      if (report.targetType === 'listing') {
        const listing = await tx.listings.get(report.targetId);
        if (!listing) throw new NotFoundError('La publicación ya no existe.');
        if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes moderar tus propias publicaciones.');
        await applyListingAction(tx, listing, action as ListingAction, ctx.userId, note, ctx.now);
      } else if (report.targetType === 'comment') {
        const comment = await tx.postComments.get(report.targetId);
        if (!comment) throw new NotFoundError('El comentario ya no existe.');
        if (comment.authorId === ctx.userId) throw new ForbiddenError('No puedes moderar tus propios comentarios.');
        await tx.postComments.update({ ...comment, hiddenAt: at, hiddenBy: ctx.userId });
        await audit(tx, ctx.userId, 'moderation.comment.hide', 'comment', comment.id, { note }, ctx.now);
      } else if (report.targetType === 'post') {
        const post = await tx.posts.get(report.targetId);
        if (!post) throw new NotFoundError('La publicación ya no existe.');
        if (post.authorId === ctx.userId) throw new ForbiddenError('No puedes moderar tus propias publicaciones.');
        await tx.posts.update({ ...post, hiddenAt: at, hiddenBy: ctx.userId });
        await audit(tx, ctx.userId, 'moderation.post.hide', 'post', post.id, { note }, ctx.now);
      } else if (report.targetType === 'message') {
        const message = await tx.messages.get(report.targetId);
        if (message) await tx.messages.update({ ...message, hidden: true });
        await audit(tx, ctx.userId, 'moderation.message.hide', 'message', report.targetId, { note }, ctx.now);
      } else {
        const user = await tx.users.get(report.targetId);
        if (!user) throw new NotFoundError('El usuario ya no existe.');
        if (user.id === ctx.userId) throw new ForbiddenError('No puedes moderar tu propia cuenta.');
        if (action === 'suspend') await tx.users.update({ ...user, suspendedAt: at, suspendedReason: note });
        if (action === 'unsuspend') { const restored = { ...user }; delete restored.suspendedAt; delete restored.suspendedReason; await tx.users.update(restored); }
        await audit(tx, ctx.userId, `moderation.user.${action}`, 'user', user.id, { note }, ctx.now);
        await emit(tx, { type: `moderation.account.${action === 'warn' ? 'warned' : action === 'suspend' ? 'suspended' : 'restored'}`, aggregateType: 'user', aggregateId: user.id, payload: { userId: user.id, note }, dedupeKey: `mod-account:${user.id}:${action}:${at}`, now: ctx.now });
      }
    }
    const resolution = action === 'dismiss' ? `Descartada: ${note}` : `${action}: ${note}`;
    for (const twin of (await tx.reports.list({ targetId: report.targetId })).filter(row => ['abierta', 'en_revision'].includes(row.status))) {
      await tx.reports.update({ ...twin, status: action === 'dismiss' ? 'descartada' : 'resuelta', resolution, updatedAt: at });
    }
    await audit(tx, ctx.userId, 'moderation.report.resolve', report.targetType, report.targetId, { reportId, action, note }, ctx.now);
    return (await tx.reports.get(reportId))!;
  });
}

export async function listDisputes(store: Store, staffId: string) {
  return store.tx(async tx => {
    await requireStaff(tx, staffId);
    const out = [];
    for (const op of (await tx.operations.list({ status: 'disputada' })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const listing = await tx.listings.get(op.listingId);
      const [buyer, seller] = [await tx.users.get(op.buyerId), await tx.users.get(op.sellerId)];
      out.push({ id: op.id, bird: listing?.snapshot.name ?? 'Ave', price: op.price, reason: op.disputeReason ?? '', buyer: buyer ? aliasOf(buyer) : 'Usuario', seller: seller ? aliasOf(seller) : 'Usuario', updatedAt: op.updatedAt, history: op.history.map(entry => ({ at: entry.at, status: entry.status, note: entry.note })) });
    }
    return out;
  });
}

/** Resolver una disputa: cancelar (libera el ave) o reanudar donde estaba antes de la disputa. */
export async function resolveDispute(store: Store, ctx: Ctx, operationId: string, input: { decision: unknown; note: unknown }): Promise<void> {
  const note = text(input.note, 'La nota de resolución', 5, 500);
  if (input.decision !== 'cancel' && input.decision !== 'resume') throw new ValidationError('Decisión no válida.');
  await store.tx(async tx => {
    await requireStaff(tx, ctx.userId);
    const op = await tx.operations.get(operationId);
    if (!op) throw new NotFoundError('Operación no encontrada.');
    if (op.status !== 'disputada') throw new ConflictError('Esta operación no está en disputa.');
    if (op.buyerId === ctx.userId || op.sellerId === ctx.userId) throw new ForbiddenError('No puedes resolver una disputa de una operación en la que participas.');
    if (input.decision === 'cancel') {
      await releaseOperationLocks(tx, op, ctx.now);
      op.cancelReason = `Cancelada por moderación: ${note}`;
      pushHistory(op, 'cancelada', ctx.userId, ctx.now, op.cancelReason);
    } else {
      const before = [...op.history].reverse().find(entry => entry.status !== 'disputada')?.status ?? 'pago_pendiente';
      pushHistory(op, before, ctx.userId, ctx.now, `Disputa resuelta por moderación; se reanuda: ${note}`);
    }
    await tx.operations.update(op);
    await audit(tx, ctx.userId, `moderation.dispute.${input.decision}`, 'operation', op.id, { note }, ctx.now);
    await emit(tx, { type: 'moderation.dispute.resolved', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, decision: input.decision, note }, dedupeKey: `dispute-resolved:${op.id}:${ctx.now.toISOString()}`, now: ctx.now });
  });
}
