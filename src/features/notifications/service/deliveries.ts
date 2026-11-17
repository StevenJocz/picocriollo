import { randomUUID } from 'node:crypto';
import type { Category, ChannelId, NotificationRecord, PreferencesRecord, Store, Tx } from '../../../server/storage/types.ts';
import { CATEGORIES } from './constants.ts';
import type { ProviderRegistry } from './channels.ts';
import { getPreferences, nextDeliveryTime } from './preferences.ts';

// Reintentos con retroceso: 1 min, 5 min, 30 min, 2 h, 6 h. Tras el último intento queda "failed" (la notificación interna no se toca).
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;
const EXTERNAL: ChannelId[] = ['browser', 'email', 'push'];

/** Crea una entrega por canal externo configurado, activado y permitido para esa categoría. Los avisos críticos no esperan al silencio. */
export async function createDeliveries(tx: Tx, notification: NotificationRecord, prefs: PreferencesRecord, providers: ProviderRegistry, now: Date): Promise<number> {
  let created = 0;
  const urgent = notification.critical || notification.priority === 'critica';
  for (const channel of EXTERNAL) {
    if (!providers[channel] || !prefs.channels[channel]) continue;
    const allowed: Category[] = prefs.channelCategories[channel] ?? CATEGORIES;
    if (!allowed.includes(notification.category)) continue;
    await tx.deliveries.insert({ id: randomUUID(), notificationId: notification.id, userId: notification.userId, channel, status: 'pending', attempts: 0, notBefore: (urgent ? now : nextDeliveryTime(prefs, now)).toISOString() });
    created++;
  }
  return created;
}

export interface DeliveryResult { sent: number; retrying: number; failed: number; skipped: number; }

/**
 * Procesa entregas pendientes. La llamada al proveedor ocurre fuera de la transacción. Antes de enviar se
 * "reserva" la entrega (intento + siguiente reintento) para que dos procesos no envíen lo mismo a la vez.
 */
export async function processDeliveries(store: Store, now: Date, providers: ProviderRegistry, limit = 50): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
  const due = await store.tx(async tx => (await tx.deliveries.list({ status: 'pending' }))
    .filter(row => row.notBefore <= now.toISOString() && (!row.nextAttemptAt || row.nextAttemptAt <= now.toISOString()))
    .sort((a, b) => a.notBefore.localeCompare(b.notBefore)).slice(0, limit).map(row => row.id));

  for (const id of due) {
    const claimed = await store.tx(async tx => {
      const delivery = await tx.deliveries.get(id);
      if (!delivery || delivery.status !== 'pending' || (delivery.nextAttemptAt && delivery.nextAttemptAt > now.toISOString())) return undefined;
      const provider = providers[delivery.channel];
      const notification = await tx.notifications.get(delivery.notificationId);
      const user = notification ? await tx.users.get(notification.userId) : undefined;
      if (!provider || !notification || !user || notification.userId !== delivery.userId) {
        await tx.deliveries.update({ ...delivery, status: 'skipped', lastError: provider ? 'Destinatario no encontrado' : 'Canal no configurado' });
        result.skipped++;
        return undefined;
      }
      const subscriptions = delivery.channel === 'browser' ? await tx.pushSubscriptions.list({ userId: user.id }) : [];
      if (delivery.channel === 'browser' && !subscriptions.length) {
        await tx.deliveries.update({ ...delivery, status: 'skipped', lastError: 'Sin suscripción del navegador' });
        result.skipped++;
        return undefined;
      }
      const prefs = await getPreferences(tx, user.id, now);
      const attempts = delivery.attempts + 1;
      await tx.deliveries.update({ ...delivery, attempts, nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]).toISOString() });
      return { delivery: { ...delivery, attempts }, provider, notification, user, prefs, subscriptions };
    });
    if (!claimed) continue;

    let outcome: { ok: true; removed: string[] } | { ok: false; error: string };
    try {
      const sent = await claimed.provider.send({ notification: claimed.notification, user: claimed.user, prefs: claimed.prefs, subscriptions: claimed.subscriptions });
      outcome = { ok: true, removed: sent?.removeEndpoints ?? [] };
    } catch (error) { outcome = { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'Error desconocido del proveedor' }; }

    await store.tx(async tx => {
      const delivery = await tx.deliveries.get(id);
      if (!delivery) return;
      if (outcome.ok) {
        for (const endpoint of outcome.removed) for (const row of await tx.pushSubscriptions.list({ endpoint })) await tx.pushSubscriptions.remove(row.id);
        await tx.deliveries.update({ ...delivery, status: 'sent', sentAt: now.toISOString(), lastError: undefined, nextAttemptAt: undefined });
        result.sent++;
      } else if (claimed.delivery.attempts >= MAX_ATTEMPTS) {
        await tx.deliveries.update({ ...delivery, status: 'failed', lastError: outcome.error, nextAttemptAt: undefined });
        result.failed++;
      } else {
        await tx.deliveries.update({ ...delivery, lastError: outcome.error });
        result.retrying++;
      }
    });
  }
  return result;
}
