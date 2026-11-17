import { randomUUID } from 'node:crypto';
import type { OutboxRecord, Store } from '../../../server/storage/types.ts';
import type { EventRegistry } from './events.ts';
import type { ProviderRegistry } from './channels.ts';
import { createDeliveries } from './deliveries.ts';
import { getPreferences } from './preferences.ts';

export interface ProcessOptions { registry: EventRegistry; limit?: number; maxAttempts?: number; providers?: ProviderRegistry; /** Se llama, ya confirmada la transacción, con los usuarios a quienes se les creó una notificación. */ onNotified?: (userIds: string[]) => void; }
export interface ProcessResult { processed: number; created: number; failed: number; }

// Convierte eventos confirmados del outbox en notificaciones. Es idempotente:
// la unicidad (userId, dedupeKey) impide duplicados aunque se reprocese el mismo evento.
export async function processOutbox(store: Store, now: Date, options: ProcessOptions): Promise<ProcessResult> {
  const limit = options.limit ?? 50, maxAttempts = options.maxAttempts ?? 5;
  const pending = await store.tx(async tx => (await tx.outbox.list({ status: 'pending' })).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(0, limit).map(row => row.id));
  const result: ProcessResult = { processed: 0, created: 0, failed: 0 };
  for (const id of pending) {
    try {
      const notified: string[] = [];
      const created = await store.tx(async tx => {
        notified.length = 0;
        const event = await tx.outbox.get(id);
        if (!event || event.status !== 'pending') return -1;
        const def = options.registry[event.type];
        if (!def) throw new Error(`Tipo de evento desconocido: ${event.type}`);
        let count = 0;
        for (const userId of new Set(await def.recipients(tx, event))) {
          const prefs = await getPreferences(tx, userId, now);
          if (!def.critical) {
            if (prefs.categories[def.category] === false) continue;
            if (def.preference && prefs.commercial[def.preference] === false) continue;
          }
          const dedupeKey = `${event.dedupeKey}:${userId}`;
          if ((await tx.notifications.list({ userId, dedupeKey })).length) continue;
          const view = await def.render(tx, event, userId);
          const notification = {
            id: randomUUID(), userId, category: def.category, priority: def.priority, critical: def.critical, type: event.type,
            title: view.title, body: view.body, link: view.link, eventId: event.id, dedupeKey, createdAt: now.toISOString(),
          };
          await tx.notifications.insert(notification);
          await createDeliveries(tx, notification, prefs, options.providers ?? {}, now);
          notified.push(userId);
          count++;
        }
        await tx.outbox.update({ ...event, status: 'processed', processedAt: now.toISOString() } satisfies OutboxRecord);
        return count;
      });
      if (created >= 0) {
        result.processed++; result.created += created;
        if (notified.length) { try { options.onNotified?.([...notified]); } catch { /* el aviso en vivo nunca rompe el proceso */ } }
      }
    } catch (error) {
      result.failed++;
      await store.tx(async tx => {
        const event = await tx.outbox.get(id);
        if (!event) return;
        const attempts = event.attempts + 1;
        await tx.outbox.update({ ...event, attempts, lastError: error instanceof Error ? error.message : String(error), status: attempts >= maxAttempts ? 'failed' : 'pending' });
      });
    }
  }
  return result;
}
