'use client';
import { useCallback, useEffect, useState } from 'react';
import type { NotificationRecord } from '@/server/storage/types';
import { api } from '@/features/market/service/market-client';
import { setLive } from '@/shared/live-state';

export interface Summary { unread: number; unreadMessages: number; messageThreads: string[]; critical: number; latest: NotificationRecord[]; }
const EMPTY: Summary = { unread: 0, unreadMessages: 0, messageThreads: [], critical: 0, latest: [] };
const POLL_MS = 15_000, POLL_LIVE_MS = 60_000;

// Avisos en vivo por SSE (`/api/notifications/stream`): el servidor solo avisa «hay novedades» y aquí se consulta el resumen.
// Con el canal conectado el sondeo baja a un respaldo de 60 s; si se cae, vuelve a 15 s mientras el navegador reconecta solo.
export function useNotificationSummary(enabled: boolean) {
  const [summary, setSummary] = useState<Summary>(EMPTY), [loaded, setLoaded] = useState(false), [live, setLiveState] = useState(false);
  const refresh = useCallback(async () => {
    try { setSummary(await api<Summary>('/api/notifications/summary')); setLoaded(true); } catch { /* sin sesión o sin red: se conserva el último valor */ }
  }, []);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/notifications/stream');
    const connected = (value: boolean) => { setLive(value); setLiveState(value); };
    source.addEventListener('ready', () => { connected(true); void refresh(); });
    source.addEventListener('notify', () => { void refresh(); window.dispatchEvent(new Event('pico-live')); });
    source.onerror = () => connected(false);
    return () => { source.close(); connected(false); };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, live ? POLL_LIVE_MS : POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [enabled, refresh, live]);
  return { summary, loaded, live, refresh };
}
