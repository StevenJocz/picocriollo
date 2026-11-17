import { ValidationError } from '../../../server/errors.ts';
import type { Category, ChannelId, PreferencesRecord, Tx } from '../../../server/storage/types.ts';
import { addDays, dateInZone, zonedLocalToIso } from '../../../shared/time.ts';
import { CATEGORIES, CHANNELS } from './constants.ts';

export const DEFAULT_TIME_ZONE = 'America/Bogota';

export function defaultPreferences(userId: string, now: Date = new Date()): PreferencesRecord {
  return {
    id: userId,
    categories: Object.fromEntries(CATEGORIES.map(category => [category, true])) as Record<Category, boolean>,
    channels: { inApp: true, browser: false, email: false, push: false },
    quietHours: { enabled: false, start: '22:00', end: '06:00' },
    timeZone: DEFAULT_TIME_ZONE, channelCategories: {},
    incubationLeadDays: 3, taskLeadDays: 2, incubationMarginDays: 2, incubationStaleDays: 10,
    digest: 'nunca', commercial: { offers: true, interests: true },
    updatedAt: now.toISOString(),
  };
}

export async function getPreferences(tx: Tx, userId: string, now: Date = new Date()): Promise<PreferencesRecord> {
  const stored = await tx.preferences.get(userId);
  if (!stored) return defaultPreferences(userId, now);
  const base = defaultPreferences(userId, now);
  return { ...base, ...stored, channelCategories: { ...stored.channelCategories }, categories: { ...base.categories, ...stored.categories }, channels: { ...base.channels, ...stored.channels }, commercial: { ...base.commercial, ...stored.commercial }, quietHours: { ...base.quietHours, ...stored.quietHours } };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isValidTimeZone(zone: string) {
  try { new Intl.DateTimeFormat('es-CO', { timeZone: zone }); return true; } catch { return false; }
}

// Valida y fusiona cambios parciales. La bandeja interna no se puede apagar.
export async function updatePreferences(tx: Tx, userId: string, patch: Record<string, unknown>, now: Date): Promise<PreferencesRecord> {
  const current = await getPreferences(tx, userId, now);
  const next: PreferencesRecord = structuredClone(current);
  if (patch.categories !== undefined) {
    if (typeof patch.categories !== 'object' || patch.categories === null) throw new ValidationError('Categorías no válidas.');
    for (const [key, value] of Object.entries(patch.categories)) {
      if (!CATEGORIES.includes(key as Category) || typeof value !== 'boolean') throw new ValidationError('Categorías no válidas.');
      next.categories[key as Category] = value;
    }
  }
  if (patch.channels !== undefined) {
    if (typeof patch.channels !== 'object' || patch.channels === null) throw new ValidationError('Canales no válidos.');
    for (const [key, value] of Object.entries(patch.channels)) {
      if (!CHANNELS.includes(key as ChannelId) || typeof value !== 'boolean') throw new ValidationError('Canales no válidos.');
      next.channels[key as ChannelId] = value;
    }
    next.channels.inApp = true;
  }
  if (patch.channelCategories !== undefined) {
    const map = patch.channelCategories as Record<string, unknown>;
    if (typeof map !== 'object' || map === null) throw new ValidationError('Categorías por canal no válidas.');
    for (const [channel, list] of Object.entries(map)) {
      if (!CHANNELS.includes(channel as ChannelId) || !Array.isArray(list) || list.some(item => !CATEGORIES.includes(item as Category))) throw new ValidationError('Categorías por canal no válidas.');
      next.channelCategories[channel as ChannelId] = [...new Set(list as Category[])];
    }
  }
  if (patch.quietHours !== undefined) {
    const q = patch.quietHours as Record<string, unknown>;
    if (typeof q !== 'object' || q === null || typeof q.enabled !== 'boolean' || typeof q.start !== 'string' || typeof q.end !== 'string' || !HHMM.test(q.start) || !HHMM.test(q.end)) throw new ValidationError('Horario de silencio no válido (HH:MM).');
    next.quietHours = { enabled: q.enabled, start: q.start, end: q.end };
  }
  if (patch.timeZone !== undefined) {
    if (typeof patch.timeZone !== 'string' || !isValidTimeZone(patch.timeZone)) throw new ValidationError('Zona horaria no válida.');
    next.timeZone = patch.timeZone;
  }
  for (const [key, min, max] of [['incubationLeadDays', 0, 14], ['taskLeadDays', 0, 30], ['incubationMarginDays', 0, 7], ['incubationStaleDays', 1, 30]] as const) {
    if (patch[key] !== undefined) {
      const value = Number(patch[key]);
      if (!Number.isInteger(value) || value < min || value > max) throw new ValidationError(`${key} debe estar entre ${min} y ${max}.`);
      next[key] = value;
    }
  }
  if (patch.digest !== undefined) {
    if (!['nunca', 'diario', 'semanal'].includes(String(patch.digest))) throw new ValidationError('Frecuencia de resumen no válida.');
    next.digest = patch.digest as PreferencesRecord['digest'];
  }
  if (patch.commercial !== undefined) {
    const c = patch.commercial as Record<string, unknown>;
    if (typeof c !== 'object' || c === null) throw new ValidationError('Preferencias comerciales no válidas.');
    if (c.offers !== undefined) { if (typeof c.offers !== 'boolean') throw new ValidationError('Preferencias comerciales no válidas.'); next.commercial.offers = c.offers; }
    if (c.interests !== undefined) { if (typeof c.interests !== 'boolean') throw new ValidationError('Preferencias comerciales no válidas.'); next.commercial.interests = c.interests; }
  }
  next.updatedAt = now.toISOString();
  if (await tx.preferences.get(userId)) await tx.preferences.update(next); else await tx.preferences.insert(next);
  return next;
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** ¿Es ahora hora de silencio para esta persona? (horario en su zona; admite cruce de medianoche, p. ej. 22:00–06:00) */
export function isQuietNow(prefs: Pick<PreferencesRecord, 'quietHours' | 'timeZone'>, now: Date): boolean {
  if (!prefs.quietHours.enabled) return false;
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const minutes = toMinutes(local), start = toMinutes(prefs.quietHours.start), end = toMinutes(prefs.quietHours.end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Primer instante en que se puede entregar un aviso no urgente por canales externos. */
export function nextDeliveryTime(prefs: Pick<PreferencesRecord, 'quietHours' | 'timeZone'>, now: Date): Date {
  if (!isQuietNow(prefs, now)) return now;
  const today = dateInZone(now, prefs.timeZone);
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const crossesMidnight = toMinutes(prefs.quietHours.start) > toMinutes(prefs.quietHours.end);
  const endDay = crossesMidnight && toMinutes(local) >= toMinutes(prefs.quietHours.start) ? addDays(today, 1) : today;
  const iso = zonedLocalToIso(`${endDay}T${prefs.quietHours.end}`, prefs.timeZone);
  return iso ? new Date(iso) : now;
}
