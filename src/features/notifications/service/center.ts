import { ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { Category, NotificationRecord, Store } from '../../../server/storage/types.ts';
import { CATEGORIES } from './constants.ts';

export const MESSAGE_EVENT = 'market.message.created';

export interface NotificationQuery { status?: 'todas' | 'no_leidas' | 'leidas'; category?: string; limit?: number; before?: string; }

// Toda consulta se limita al usuario de la sesión: nunca se acepta un userId del cliente.
export async function listNotifications(store: Store, userId: string, query: NotificationQuery = {}): Promise<NotificationRecord[]> {
  if (query.category && !CATEGORIES.includes(query.category as Category)) throw new ValidationError('Categoría no válida.');
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
  const rows = await store.tx(tx => tx.notifications.list({ userId }));
  return rows
    .filter(row => !query.category || row.category === query.category)
    .filter(row => query.status === 'no_leidas' ? !row.readAt : query.status === 'leidas' ? Boolean(row.readAt) : true)
    .filter(row => !query.before || row.createdAt < query.before)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

export async function notificationSummary(store: Store, userId: string) {
  const rows = await store.tx(tx => tx.notifications.list({ userId }));
  const unread = rows.filter(row => !row.readAt);
  const latest = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const messages = unread.filter(row => row.type === MESSAGE_EVENT);
  const messageThreads = [...new Set(messages.map(row => row.link.id).filter((id): id is string => Boolean(id)))];
  return { unread: unread.length - messages.length, unreadMessages: messages.length, messageThreads, critical: unread.filter(row => row.critical || row.priority === 'critica' || row.priority === 'alta').length, latest };
}

export async function markRead(store: Store, userId: string, ids: string[], now: Date): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || ids.some(id => typeof id !== 'string')) throw new ValidationError('Indica entre 1 y 200 notificaciones.');
  return store.tx(async tx => {
    let changed = 0;
    for (const id of ids) {
      const row = await tx.notifications.get(id);
      if (!row) throw new NotFoundError('Notificación no encontrada.');
      if (row.userId !== userId) throw new ForbiddenError('Esa notificación no te pertenece.');
      if (!row.readAt) { await tx.notifications.update({ ...row, readAt: now.toISOString() }); changed++; }
    }
    return changed;
  });
}

export async function markAllRead(store: Store, userId: string, now: Date): Promise<number> {
  return store.tx(async tx => {
    let changed = 0;
    for (const row of await tx.notifications.list({ userId })) {
      if (!row.readAt) { await tx.notifications.update({ ...row, readAt: now.toISOString() }); changed++; }
    }
    return changed;
  });
}

/** Marca como leídas las notificaciones sin leer de un tipo cuyo enlace apunta a `linkId` (p. ej. los mensajes de una conversación). */
export async function markLinkRead(store: Store, userId: string, type: string, linkId: string, now: Date): Promise<number> {
  if (typeof type !== 'string' || !type || type.length > 60 || typeof linkId !== 'string' || !linkId || linkId.length > 120) throw new ValidationError('Indica el tipo y el enlace de las notificaciones.');
  return store.tx(async tx => {
    let changed = 0;
    for (const row of await tx.notifications.list({ userId })) {
      if (!row.readAt && row.type === type && row.link.id === linkId) { await tx.notifications.update({ ...row, readAt: now.toISOString() }); changed++; }
    }
    return changed;
  });
}
