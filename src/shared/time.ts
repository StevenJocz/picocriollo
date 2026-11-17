// Fechas con zona horaria explícita. Sin dependencias: sirve en servidor, pruebas y navegador.
export const DEFAULT_TIME_ZONE = 'America/Bogota';

function offsetMs(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - Math.floor(timestamp / 1000) * 1000;
}

/** Convierte "AAAA-MM-DDTHH:mm" interpretado en la zona dada a un instante ISO (UTC). Devuelve null si no es válido. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) return null;
  let instant = wall - offsetMs(wall, timeZone);
  instant = wall - offsetMs(instant, timeZone); // segunda pasada por si cruza un cambio de horario
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatInZone(iso: string, timeZone: string = DEFAULT_TIME_ZONE, withYear = false): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone, day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Tiempo restante legible ("2 d 3 h", "45 min"). */
export function remaining(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'Cerrada';
  const minutes = Math.floor(ms / 60_000), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes % 60} min`;
  return `${Math.max(minutes, 1)} min`;
}

/** Fecha calendario (AAAA-MM-DD) de un instante en la zona dada. */
export function dateInZone(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** Suma días a una fecha calendario sin depender de la zona horaria del servidor. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
/** Días de calendario entre dos fechas (b - a). */
export function daysBetween(a: string, b: string): number {
  const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}
