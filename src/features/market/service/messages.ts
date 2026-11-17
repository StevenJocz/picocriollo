import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { ListingRecord, MessageRecord, OperationRecord, Store, ThreadRecord, Tx } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import { assertActive } from '../../../server/guards.ts';
import { aliasOf } from './snapshot.ts';
import type { Ctx } from './listings.ts';

const MAX_BODY = 1000;
const RATE_LIMIT = { count: 30, windowMs: 3_600_000 };
const CONTACT_OK: OperationRecord['status'][] = ['aceptada', 'pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada', 'completada'];

/** Detecta correos o teléfonos: no se comparten hasta que exista una operación aceptada. */
export function containsContactInfo(text: string): boolean {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) return true;
  return /(?:\d[\s().-]*){7,}/.test(text);
}

async function activeOperation(tx: Tx, listingId: string, buyerId: string) {
  return (await tx.operations.list({ listingId })).find(op => op.buyerId === buyerId && op.status !== 'cancelada');
}

export async function ensureThread(tx: Tx, listing: ListingRecord, buyerId: string, now: Date): Promise<ThreadRecord> {
  const found = (await tx.threads.list({ listingId: listing.id })).find(thread => thread.participants.includes(buyerId));
  const op = await activeOperation(tx, listing.id, buyerId);
  if (found) {
    if (op && found.operationId !== op.id) { const updated = { ...found, operationId: op.id }; await tx.threads.update(updated); return updated; }
    return found;
  }
  const thread: ThreadRecord = { id: randomUUID(), listingId: listing.id, ...(op ? { operationId: op.id } : {}), participants: [listing.sellerId, buyerId], createdAt: now.toISOString() };
  await tx.threads.insert(thread);
  return thread;
}

function cleanBody(body: unknown): string {
  if (typeof body !== 'string') throw new ValidationError('Escribe un mensaje.');
  const text = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text) throw new ValidationError('Escribe un mensaje.');
  if (text.length > MAX_BODY) throw new ValidationError(`El mensaje supera ${MAX_BODY} caracteres.`);
  return text;
}

/** Inserta un mensaje dentro de una transacción ya abierta (también lo usa la solicitud de compra). */
export async function appendMessage(tx: Tx, thread: ThreadRecord, senderId: string, rawBody: unknown, now: Date): Promise<MessageRecord> {
  const body = cleanBody(rawBody);
  if (!thread.participants.includes(senderId)) throw new ForbiddenError('Esta conversación no es tuya.');
  const op = thread.operationId ? await tx.operations.get(thread.operationId) : undefined;
  if (containsContactInfo(body) && !(op && CONTACT_OK.includes(op.status))) {
    throw new ValidationError('Por seguridad no compartas teléfono ni correo en el chat hasta que la operación esté aceptada. Podrás compartir tu contacto con consentimiento de ambas partes.');
  }
  const since = now.getTime() - RATE_LIMIT.windowMs;
  const recent = (await tx.messages.list({ senderId })).filter(msg => new Date(msg.createdAt).getTime() >= since);
  if (recent.length >= RATE_LIMIT.count) throw new ConflictError('Enviaste demasiados mensajes. Espera un momento antes de escribir de nuevo.');
  const message: MessageRecord = { id: randomUUID(), threadId: thread.id, senderId, body, createdAt: now.toISOString() };
  await tx.messages.insert(message);
  const recipient = thread.participants.find(id => id !== senderId)!;
  await emit(tx, { type: 'market.message.created', aggregateType: 'thread', aggregateId: thread.id, payload: { threadId: thread.id, messageId: message.id, recipientId: recipient, listingId: thread.listingId }, dedupeKey: `message:${message.id}`, now });
  return message;
}

export interface SendInput { listingId?: string; threadId?: string; body: unknown; }

/** El comprador abre la conversación desde la publicación; el vendedor solo responde dentro de una conversación existente. */
export async function sendMessage(store: Store, ctx: Ctx, input: SendInput): Promise<{ threadId: string; messageId: string }> {
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    let thread: ThreadRecord | undefined;
    if (input.threadId) {
      thread = await tx.threads.get(input.threadId);
      if (!thread) throw new NotFoundError('Conversación no encontrada.');
      if (!thread.participants.includes(ctx.userId)) throw new ForbiddenError('Esta conversación no es tuya.');
    } else {
      const listing = await tx.listings.get(String(input.listingId));
      if (!listing || listing.status === 'borrador') throw new NotFoundError('Publicación no encontrada.');
      if (listing.sellerId === ctx.userId) throw new ForbiddenError('Responde desde la conversación del comprador.');
      if (!['publicada', 'en_operacion'].includes(listing.status) && !(await activeOperation(tx, listing.id, ctx.userId))) throw new ConflictError('Esta publicación ya no admite mensajes nuevos.');
      thread = await ensureThread(tx, listing, ctx.userId, ctx.now);
    }
    const message = await appendMessage(tx, thread, ctx.userId, input.body, ctx.now);
    return { threadId: thread.id, messageId: message.id };
  });
}

export interface ThreadSummary { id: string; listingId: string; listingName: string; counterpart: string; counterpartId: string; counterpartAvatarUrl?: string; role: 'comprador' | 'vendedor'; operationId?: string; lastMessage: string; lastAt: string; }

export async function listThreads(store: Store, userId: string): Promise<ThreadSummary[]> {
  return store.tx(async tx => {
    const out: ThreadSummary[] = [];
    for (const thread of (await tx.threads.list()).filter(item => item.participants.includes(userId))) {
      const listing = await tx.listings.get(thread.listingId);
      const otherId = thread.participants.find(id => id !== userId)!;
      const other = await tx.users.get(otherId);
      const last = (await tx.messages.list({ threadId: thread.id })).filter(msg => !msg.hidden).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!last) continue;
      out.push({ id: thread.id, listingId: thread.listingId, listingName: listing?.snapshot.name ?? 'Publicación', counterpart: other ? aliasOf(other) : 'Usuario', counterpartId: otherId, ...(other?.avatarId ? { counterpartAvatarUrl: `/api/media/${other.avatarId}` } : {}), role: listing?.sellerId === userId ? 'vendedor' : 'comprador', ...(thread.operationId ? { operationId: thread.operationId } : {}), lastMessage: last.body.slice(0, 140), lastAt: last.createdAt });
    }
    return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  });
}

export async function getThread(store: Store, userId: string, threadId: string) {
  return store.tx(async tx => {
    const thread = await tx.threads.get(threadId);
    if (!thread) throw new NotFoundError('Conversación no encontrada.');
    if (!thread.participants.includes(userId)) throw new ForbiddenError('Esta conversación no es tuya.');
    const listing = await tx.listings.get(thread.listingId);
    const aliases = new Map<string, string>(), avatars = new Map<string, string>();
    for (const id of thread.participants) { const user = await tx.users.get(id); aliases.set(id, user ? aliasOf(user) : 'Usuario'); if (user?.avatarId) avatars.set(id, `/api/media/${user.avatarId}`); }
    const messages = (await tx.messages.list({ threadId })).filter(msg => !msg.hidden).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(msg => ({ id: msg.id, mine: msg.senderId === userId, authorId: msg.senderId, author: aliases.get(msg.senderId)!, body: msg.body, createdAt: msg.createdAt }));
    const otherId = thread.participants.find(id => id !== userId) ?? userId;
    return { id: thread.id, listingId: thread.listingId, listingName: listing?.snapshot.name ?? 'Publicación', operationId: thread.operationId, counterpart: { id: otherId, alias: aliases.get(otherId) ?? 'Usuario', ...(avatars.get(otherId) ? { avatarUrl: avatars.get(otherId)! } : {}) }, messages };
  });
}

/** Conversación del comprador con el vendedor para una publicación (si existe), para mostrarla en el detalle. */
export async function myThreadForListing(store: Store, userId: string, listingId: string): Promise<string | undefined> {
  return store.tx(async tx => (await tx.threads.list({ listingId })).find(thread => thread.participants.includes(userId))?.id);
}
