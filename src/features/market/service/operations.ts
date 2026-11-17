import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { ListingRecord, OperationRecord, OperationStatus, Store, Tx } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import type { Ctx } from './listings.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import { ratingStateIn } from './trust.ts';
import type { RatingState } from './trust.ts';
import { appendMessage, ensureThread } from './messages.ts';
import { aliasOf } from './snapshot.ts';
import { executeTransfer } from './transfer.ts';
import { activeLocks, freeOperationLocks, releaseLocks, reserveLocks } from './locks.ts';

export const FINAL_STATUSES: OperationStatus[] = ['completada', 'cancelada'];
export const OPEN_STATUSES: OperationStatus[] = ['solicitud_recibida', 'aceptada', 'pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada', 'disputada'];

export function pushHistory(op: OperationRecord, status: OperationStatus, actorId: string, now: Date, note?: string) {
  op.status = status;
  op.updatedAt = now.toISOString();
  op.version += 1;
  op.history.push({ at: op.updatedAt, status, actorId, ...(note ? { note } : {}) });
}

export async function newOperation(tx: Tx, input: { listing: ListingRecord; buyerId: string; origin: OperationRecord['origin']; price: number; status: OperationStatus; now: Date; actorId: string }): Promise<OperationRecord> {
  const at = input.now.toISOString();
  const op: OperationRecord = {
    id: randomUUID(), listingId: input.listing.id, birdId: input.listing.birdId, sellerId: input.listing.sellerId, buyerId: input.buyerId,
    origin: input.origin, price: input.price, status: input.status, shareContact: { seller: false, buyer: false },
    history: [{ at, status: input.status, actorId: input.actorId }], createdAt: at, updatedAt: at, version: 1,
  };
  await tx.operations.insert(op);
  return op;
}

async function audit(tx: Tx, ctx: Ctx, action: string, op: OperationRecord, detail: Record<string, unknown> = {}) {
  await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action, targetType: 'operation', targetId: op.id, detail, createdAt: ctx.now.toISOString() });
}

/** Solicitud de compra directa. No bloquea el ave ni marca nada como vendido: espera la decisión del vendedor. */
export async function requestPurchase(store: Store, ctx: Ctx, listingId: string, message?: unknown): Promise<OperationRecord> {
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const listing = await tx.listings.get(listingId);
    if (!listing || listing.status !== 'publicada') throw new NotFoundError('Esta publicación no está disponible.');
    if (listing.sellerId === ctx.userId) throw new ForbiddenError('No puedes comprar tu propia publicación.');
    await assertRate(tx, ctx.userId, 'operation.request', ctx.now);
    if (listing.kind !== 'fixed') throw new ConflictError(listing.kind === 'auction' ? 'Esta publicación es una subasta: haz una oferta.' : 'Esta publicación no tiene precio: contacta al vendedor.');
    const existing = (await tx.operations.list({ listingId })).find(op => op.buyerId === ctx.userId && OPEN_STATUSES.includes(op.status));
    if (existing) throw new ConflictError('Ya tienes una solicitud abierta para esta publicación.');
    const op = await newOperation(tx, { listing, buyerId: ctx.userId, origin: 'directa', price: listing.price, status: 'solicitud_recibida', now: ctx.now, actorId: ctx.userId });
    if (typeof message === 'string' && message.trim()) {
      const thread = await ensureThread(tx, listing, ctx.userId, ctx.now);
      await appendMessage(tx, thread, ctx.userId, message, ctx.now);
    }
    await audit(tx, ctx, 'operation.request', op, { price: op.price });
    await emit(tx, { type: 'market.purchase.requested', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `purchase-requested:${op.id}`, now: ctx.now });
    return op;
  });
}

/** El vendedor acepta o rechaza. Al aceptar, el ave queda reservada para esa operación y las demás solicitudes se cierran. */
export async function respondPurchase(store: Store, ctx: Ctx, operationId: string, decision: 'accept' | 'reject'): Promise<OperationRecord> {
  return store.tx(async tx => {
    const op = await tx.operations.get(operationId);
    if (!op) throw new NotFoundError('Operación no encontrada.');
    if (op.sellerId !== ctx.userId) throw new ForbiddenError('Solo el vendedor puede responder esta solicitud.');
    if (op.status !== 'solicitud_recibida') throw new ConflictError('Esta solicitud ya fue respondida.');
    if (decision === 'reject') {
      op.cancelReason = 'Rechazada por el vendedor';
      pushHistory(op, 'cancelada', ctx.userId, ctx.now, op.cancelReason);
      await tx.operations.update(op);
      await audit(tx, ctx, 'operation.reject', op);
      await emit(tx, { type: 'market.purchase.rejected', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `purchase-rejected:${op.id}`, now: ctx.now });
      return op;
    }
    const listing = await tx.listings.get(op.listingId);
    if (!listing || listing.status !== 'publicada') throw new ConflictError('La publicación ya no está disponible para aceptar solicitudes.');
    const locks = await activeLocks(tx, listing.id);
    if (!locks.length || locks.some(lock => lock.operationId)) throw new ConflictError('El ave ya está comprometida en otra operación.');
    await reserveLocks(tx, listing.id, op.id);
    listing.status = 'en_operacion'; listing.updatedAt = ctx.now.toISOString(); listing.version += 1;
    await tx.listings.update(listing);
    pushHistory(op, 'aceptada', ctx.userId, ctx.now);
    pushHistory(op, 'pago_pendiente', ctx.userId, ctx.now, 'Pago pendiente');
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.accept', op, { price: op.price });
    await emit(tx, { type: 'market.purchase.accepted', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `purchase-accepted:${op.id}`, now: ctx.now });
    for (const other of (await tx.operations.list({ listingId: listing.id })).filter(item => item.id !== op.id && item.status === 'solicitud_recibida')) {
      other.cancelReason = 'El vendedor aceptó otra solicitud';
      pushHistory(other, 'cancelada', ctx.userId, ctx.now, other.cancelReason);
      await tx.operations.update(other);
      await audit(tx, ctx, 'operation.auto_reject', other);
      await emit(tx, { type: 'market.purchase.rejected', aggregateType: 'operation', aggregateId: other.id, payload: { operationId: other.id }, dedupeKey: `purchase-rejected:${other.id}`, now: ctx.now });
    }
    return op;
  });
}

/** El comprador retira su solicitud pendiente. */
export async function withdrawRequest(store: Store, ctx: Ctx, operationId: string): Promise<OperationRecord> {
  return store.tx(async tx => {
    const op = await tx.operations.get(operationId);
    if (!op) throw new NotFoundError('Operación no encontrada.');
    if (op.buyerId !== ctx.userId) throw new ForbiddenError('Esta solicitud no es tuya.');
    if (op.status !== 'solicitud_recibida') throw new ConflictError('Solo puedes retirar una solicitud pendiente.');
    op.cancelReason = 'Retirada por el comprador';
    pushHistory(op, 'cancelada', ctx.userId, ctx.now, op.cancelReason);
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.withdraw', op);
    return op;
  });
}

export interface OperationView {
  id: string; listingId: string; status: OperationStatus; origin: OperationRecord['origin']; price: number; role: 'comprador' | 'vendedor';
  birdName: string; birdCode: string; photoUrl?: string; counterpart: string; createdAt: string; updatedAt: string; cancelReason?: string;
  history: { at: string; status: OperationStatus; note?: string }[];
  threadId?: string; receiptCode?: string; invoiceNumber?: string; paymentMethod?: string; rating?: RatingState; counterpartId: string;
}

export async function listOperations(store: Store, userId: string, role?: 'comprador' | 'vendedor', now: Date = new Date()): Promise<OperationView[]> {
  return store.tx(async tx => {
    const rows = [...(role !== 'vendedor' ? await tx.operations.list({ buyerId: userId }) : []), ...(role !== 'comprador' ? await tx.operations.list({ sellerId: userId }) : [])];
    const out: OperationView[] = [];
    for (const op of rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const listing = await tx.listings.get(op.listingId);
      const otherId = op.buyerId === userId ? op.sellerId : op.buyerId;
      const other = await tx.users.get(otherId);
      const thread = (await tx.threads.list({ listingId: op.listingId })).find(item => item.participants.includes(op.buyerId));
      const receipt = (await tx.receipts.list({ operationId: op.id }))[0];
      const invoice = (await tx.invoices.list({ operationId: op.id }))[0];
      out.push({
        ...(thread ? { threadId: thread.id } : {}), ...(receipt ? { receiptCode: receipt.code } : {}), ...(invoice ? { invoiceNumber: invoice.number } : {}), ...(op.paymentMethod ? { paymentMethod: op.paymentMethod } : {}), rating: await ratingStateIn(tx, op, userId, now),
        id: op.id, listingId: op.listingId, status: op.status, origin: op.origin, price: op.price, role: op.buyerId === userId ? 'comprador' : 'vendedor',
        birdName: listing?.snapshot.name ?? 'Ave', birdCode: listing?.snapshot.code ?? '', ...(listing?.snapshot.photoId ? { photoUrl: `/api/media/${listing.snapshot.photoId}` } : {}),
        counterpart: other ? aliasOf(other) : 'Usuario', counterpartId: otherId, createdAt: op.createdAt, updatedAt: op.updatedAt, ...(op.cancelReason ? { cancelReason: op.cancelReason } : {}),
        history: op.history.map(entry => ({ at: entry.at, status: entry.status, ...(entry.note ? { note: entry.note } : {}) })),
      });
    }
    return out;
  });
}

export function assertReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length < 10) throw new ValidationError('Explica el motivo (al menos 10 caracteres).');
  if (reason.length > 500) throw new ValidationError('El motivo supera 500 caracteres.');
  return reason.trim();
}

// ---- Pago manual, entrega, cancelación, disputa y contacto ----

async function loadOperation(tx: Tx, id: string): Promise<OperationRecord> {
  const op = await tx.operations.get(id);
  if (!op) throw new NotFoundError('Operación no encontrada.');
  return op;
}
function partyOf(op: OperationRecord, userId: string): 'comprador' | 'vendedor' {
  if (op.buyerId === userId) return 'comprador';
  if (op.sellerId === userId) return 'vendedor';
  throw new ForbiddenError('Esta operación no es tuya.');
}
const requireRole = (op: OperationRecord, userId: string, role: 'comprador' | 'vendedor', message: string) => {
  if (partyOf(op, userId) !== role) throw new ForbiddenError(message);
};
const requireStatus = (op: OperationRecord, allowed: OperationStatus[], message: string) => {
  if (!allowed.includes(op.status)) throw new ConflictError(message);
};

/** El comprador declara que pagó. La plataforma NO procesa ni verifica pagos: queda como declarado hasta que el vendedor confirme. */
export async function declarePayment(store: Store, ctx: Ctx, id: string, method: unknown): Promise<OperationRecord> {
  if (typeof method !== 'string' || method.trim().length < 2 || method.trim().length > 60) throw new ValidationError('Indica el medio de pago usado (2 a 60 caracteres).');
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    requireRole(op, ctx.userId, 'comprador', 'Solo el comprador declara el pago.');
    requireStatus(op, ['pago_pendiente'], 'Esta operación no está esperando un pago.');
    op.paymentMethod = method.trim(); op.paymentDeclaredAt = ctx.now.toISOString();
    pushHistory(op, 'pago_registrado', ctx.userId, ctx.now, `Pago declarado por el comprador (${op.paymentMethod}); sin verificar por la plataforma`);
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.payment_declared', op, { method: op.paymentMethod });
    await emit(tx, { type: 'market.operation.payment_declared', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `payment-declared:${op.id}:${op.version}`, now: ctx.now });
    return op;
  });
}

/** El vendedor confirma que recibió el pago (también si se acordó fuera de la plataforma). Es una confirmación del vendedor, no una verificación de Pico Criollo. */
export async function confirmPayment(store: Store, ctx: Ctx, id: string): Promise<OperationRecord> {
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    requireRole(op, ctx.userId, 'vendedor', 'Solo el vendedor confirma que recibió el pago.');
    requireStatus(op, ['pago_pendiente', 'pago_registrado'], 'Esta operación no está esperando la confirmación de un pago.');
    op.paymentConfirmedAt = ctx.now.toISOString();
    pushHistory(op, 'entrega_pendiente', ctx.userId, ctx.now, 'Pago confirmado por el vendedor (no verificado por la plataforma)');
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.payment_confirmed', op);
    await emit(tx, { type: 'market.operation.payment_confirmed', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `payment-confirmed:${op.id}`, now: ctx.now });
    return op;
  });
}

export async function markDelivered(store: Store, ctx: Ctx, id: string): Promise<OperationRecord> {
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    requireRole(op, ctx.userId, 'vendedor', 'Solo el vendedor marca la entrega.');
    requireStatus(op, ['entrega_pendiente'], 'Primero debe confirmarse el pago.');
    op.sellerDeliveredAt = ctx.now.toISOString();
    pushHistory(op, 'entrega_confirmada', ctx.userId, ctx.now, 'Entrega confirmada por el vendedor');
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.delivered', op);
    await emit(tx, { type: 'market.operation.delivered', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id }, dedupeKey: `delivered:${op.id}`, now: ctx.now });
    return op;
  });
}

/** Confirmación de recepción del comprador: cierra la operación y transfiere la propiedad en la misma transacción. */
export async function confirmReceipt(store: Store, ctx: Ctx, id: string): Promise<{ operation: OperationRecord; receiptCode: string }> {
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    requireRole(op, ctx.userId, 'comprador', 'Solo el comprador confirma la recepción.');
    requireStatus(op, ['entrega_confirmada'], 'El vendedor aún no confirmó la entrega.');
    op.buyerReceivedAt = ctx.now.toISOString();
    const receipt = await executeTransfer(tx, op, ctx.now);
    pushHistory(op, 'completada', ctx.userId, ctx.now, `Recepción confirmada; propiedad transferida (${receipt.code})`);
    await tx.operations.update(op);
    return { operation: op, receiptCode: receipt.code };
  });
}

/** Libera la reserva del ave: la compra directa vuelve a estar publicada; la de subasta queda libre para publicarse de nuevo. */
export async function releaseOperationLocks(tx: Tx, op: OperationRecord, now: Date): Promise<void> {
  const listing = await tx.listings.get(op.listingId);
  const mine = (await activeLocks(tx, op.listingId)).filter(item => item.operationId === op.id);
  if (!listing || !mine.length) return;
  if (op.origin === 'directa') {
    await freeOperationLocks(tx, listing.id, op.id);
    if (listing.status === 'en_operacion') await tx.listings.update({ ...listing, status: 'publicada', updatedAt: now.toISOString(), version: listing.version + 1 });
  } else {
    await releaseLocks(tx, listing.id, now);
    await tx.listings.update({ ...listing, status: 'cerrada_sin_ofertas', closedReason: 'operacion_cancelada', updatedAt: now.toISOString(), version: listing.version + 1 });
  }
}

/** Cancelar libera el bloqueo de disponibilidad y conserva todo el historial y la auditoría. */
export async function cancelOperation(store: Store, ctx: Ctx, id: string, reason: unknown): Promise<OperationRecord> {
  const text = assertReason(reason);
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    const role = partyOf(op, ctx.userId);
    requireStatus(op, ['pago_pendiente', 'pago_registrado', 'entrega_pendiente'], op.status === 'entrega_confirmada' ? 'La entrega ya se confirmó: abre una disputa si hay un problema.' : 'Esta operación ya no se puede cancelar.');
    await releaseOperationLocks(tx, op, ctx.now);
    op.cancelReason = text;
    pushHistory(op, 'cancelada', ctx.userId, ctx.now, `Cancelada por el ${role}: ${text}`);
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.cancel', op, { by: role, reason: text });
    await emit(tx, { type: 'market.operation.cancelled', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, byId: ctx.userId }, dedupeKey: `operation-cancelled:${op.id}`, now: ctx.now });
    return op;
  });
}

export async function openDispute(store: Store, ctx: Ctx, id: string, reason: unknown): Promise<OperationRecord> {
  const text = assertReason(reason);
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    partyOf(op, ctx.userId);
    requireStatus(op, ['pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada'], 'Esta operación no admite una disputa en su estado actual.');
    op.disputeReason = text;
    pushHistory(op, 'disputada', ctx.userId, ctx.now, `Disputa abierta: ${text}`);
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.dispute', op, { reason: text });
    await emit(tx, { type: 'market.operation.disputed', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, byId: ctx.userId }, dedupeKey: `operation-disputed:${op.id}`, now: ctx.now });
    return op;
  });
}

const CONTACT_STATES: OperationStatus[] = ['pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada'];

/** Cada parte autoriza compartir su contacto. Solo se revela cuando ambas lo hacen y la operación está en curso. */
export async function shareContact(store: Store, ctx: Ctx, id: string): Promise<OperationRecord> {
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    const role = partyOf(op, ctx.userId);
    requireStatus(op, CONTACT_STATES, 'El contacto solo se comparte con una operación aceptada y en curso.');
    op.shareContact = { ...op.shareContact, [role === 'comprador' ? 'buyer' : 'seller']: true };
    op.updatedAt = ctx.now.toISOString(); op.version += 1;
    await tx.operations.update(op);
    await audit(tx, ctx, 'operation.share_contact', op, { role });
    return op;
  });
}

export async function getContact(store: Store, userId: string, id: string) {
  return store.tx(async tx => {
    const op = await loadOperation(tx, id);
    const role = partyOf(op, userId);
    if (!CONTACT_STATES.includes(op.status)) throw new ConflictError('El contacto solo está disponible mientras la operación está en curso.');
    if (!op.shareContact.buyer || !op.shareContact.seller) throw new ForbiddenError('El contacto se revela cuando ambas partes lo autorizan.');
    const other = (await tx.users.get(role === 'comprador' ? op.sellerId : op.buyerId))!;
    return { alias: aliasOf(other), email: other.email, phone: other.contactPhone ?? null };
  });
}
