'use client';

// Cola de señales de los reels (tiempo que cada uno estuvo a la vista y toques en avisos). Se envían en lotes pequeños
// y, al salir de la pantalla, con `sendBeacon` para que no se pierdan. Nunca interrumpe ni retrasa el scroll.

interface ClientSignal { key: string; type: 'view' | 'open'; ms?: number }

const queue: ClientSignal[] = [];
const MAX_QUEUE = 120;

export function queueSignal(signal: ClientSignal) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(signal);
}

export function flushSignals(options: { beacon?: boolean } = {}) {
  if (!queue.length) return;
  const batch = queue.splice(0, 40);
  const body = JSON.stringify({ signals: batch });
  try {
    if (options.beacon && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/reels/signals', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/reels/signals', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch { /* las señales son opcionales */ }
}

/** Clave del servidor de un reel de la pantalla (`post:<id>` → `p:<id>`, `ad:<id>` → `a:<id>`). */
export const serverKey = (clientKey: string): string => (clientKey.startsWith('post:') ? `p:${clientKey.slice(5)}` : clientKey.startsWith('ad:') ? `a:${clientKey.slice(3)}` : '');
/** Clave corta (para la lista de «ya vistos»). */
export const seenKey = (kind: 'post' | 'advertisement' | 'sample-advertisement', id: string): string => `${kind === 'post' ? 'p' : kind === 'advertisement' ? 'a' : 's'}:${id.slice(0, 8)}`;
