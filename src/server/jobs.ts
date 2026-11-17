import { runDueJobs } from '../features/market/service/auction.ts';
import { EVENT_TYPES } from '../features/notifications/service/event-registry.ts';
import { processDeliveries } from '../features/notifications/service/deliveries.ts';
import { processOutbox } from '../features/notifications/service/outbox.ts';
import { buildProviders } from '../features/notifications/service/providers.ts';
import { scanAllReminders } from '../features/notifications/service/reminders.ts';
import { cleanOrphanMedia } from '../features/profile/service/media.ts';
import type { MediaStore, Store } from './storage/types.ts';
import { publishMany } from './live.ts';

/** Todos los trabajos programados. Cada módulo añade aquí los suyos; todos son idempotentes. */
export async function runAllJobs(store: Store, now: Date, media?: MediaStore) {
  const market = await runDueJobs(store, now);
  const reminders = await scanAllReminders(store, now);
  const providers = buildProviders();
  const outbox = await processOutbox(store, now, { registry: EVENT_TYPES, providers, onNotified: publishMany });
  const deliveries = await processDeliveries(store, now, providers);
  // Archivos subidos y nunca usados (publicación abandonada, foto de perfil no elegida): se limpian pasado un día.
  const orphanMedia = media ? await cleanOrphanMedia({ store, media }, now) : undefined;
  return { market, reminders, outbox, deliveries, ...(orphanMedia ? { orphanMedia } : {}) };
}
