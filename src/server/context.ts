import { runDueJobs } from '../features/market/service/auction.ts';
import { EVENT_TYPES } from '../features/notifications/service/event-registry.ts';
import { processDeliveries } from '../features/notifications/service/deliveries.ts';
import { processOutbox } from '../features/notifications/service/outbox.ts';
import { buildProviders } from '../features/notifications/service/providers.ts';
import { scanReminders } from '../features/notifications/service/reminders.ts';
import { publishMany } from './live.ts';
import { getMedia, getStore } from './storage/index.ts';

export const deps = () => ({ store: getStore(), media: getMedia() });
export const ctxFor = (userId: string) => ({ userId, now: new Date() });

/** Convierte en notificaciones los eventos ya confirmados. Un fallo aquí nunca rompe la respuesta de negocio. */
export async function flushNotifications() {
  try {
    const now = new Date(), providers = buildProviders();
    const result = await processOutbox(getStore(), now, { registry: EVENT_TYPES, providers, onNotified: publishMany });
    // Los envíos externos no hacen esperar la respuesta ni pueden romper la notificación interna.
    if (Object.keys(providers).length) void processDeliveries(getStore(), now, providers).catch(error => console.error('[deliveries]', error));
    return result;
  }
  catch (error) { console.error('[outbox]', error); return undefined; }
}

const LAZY_KEY = Symbol.for('pico-criollo.lazy-jobs');
const LAZY_EVERY_MS = 30_000;

/**
 * Trabajos vencidos (cierre de subastas, avisos) ejecutados al consultar, como respaldo del cron.
 * Con tope de una vez cada 30 s por proceso. Es idempotente, así que repetirlo es seguro.
 */
export async function lazyJobs() {
  const holder = globalThis as unknown as Record<symbol, number | undefined>;
  const last = holder[LAZY_KEY] ?? 0;
  if (Date.now() - last < LAZY_EVERY_MS) return;
  holder[LAZY_KEY] = Date.now();
  try { await runDueJobs(getStore(), new Date()); await flushNotifications(); }
  catch (error) { console.error('[jobs]', error); }
}

const SCAN_KEY = Symbol.for('pico-criollo.reminder-scan');
const SCAN_EVERY_MS = 5 * 60_000;

/** Recordatorios del usuario al abrir la app (tope: una vez cada 5 min por usuario). El cron los cubre para todos. */
export async function lazyReminders(userId: string) {
  const holder = globalThis as unknown as Record<symbol, Map<string, number> | undefined>;
  const seen = (holder[SCAN_KEY] ??= new Map<string, number>());
  if (Date.now() - (seen.get(userId) ?? 0) < SCAN_EVERY_MS) return;
  seen.set(userId, Date.now());
  try { await scanReminders(getStore(), userId, new Date()); }
  catch (error) { console.error('[reminders]', error); }
}
