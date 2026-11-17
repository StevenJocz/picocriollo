'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationLink, NotificationRecord } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { useChat } from '@/features/market/components/chat-dock';
import type { Summary } from '../hook/use-notifications';

const MAX_TOASTS = 3, VISIBLE_MS = 8000, MESSAGE_EVENT = 'market.message.created';
interface Toast { id: string; title: string; body: string; link: NotificationLink; message: boolean; }

// Alertas emergentes abajo a la izquierda cuando llega una notificación o un mensaje nuevo (como Facebook).
// La primera respuesta del servidor solo registra lo que ya existía: no se avisa de lo viejo.
export function NotificationToasts({ summary, loaded, onOpenLink }: { summary: Summary; loaded: boolean; onOpenLink: (link: NotificationLink) => void }) {
  const chat = useChat();
  const seen = useRef<Set<string> | null>(null), timers = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) { window.clearTimeout(timer); timers.current.delete(id); }
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (seen.current === null) { seen.current = new Set(summary.latest.map(item => item.id)); return; }
    const fresh: NotificationRecord[] = summary.latest.filter(item => !seen.current!.has(item.id) && !item.readAt).reverse();
    for (const item of summary.latest) seen.current.add(item.id);
    const shown: Toast[] = [];
    for (const item of fresh) {
      const isMessage = item.type === MESSAGE_EVENT;
      // Si la conversación ya está abierta y a la vista, el mensaje se ve en la ventana: no se repite como alerta.
      if (isMessage && item.link.id && chat?.incoming(item.link.id) === 'visible') continue;
      shown.push({ id: item.id, title: item.title, body: item.body, link: item.link, message: isMessage });
    }
    if (!shown.length) return;
    window.setTimeout(() => {
      setToasts(current => [...current, ...shown].slice(-MAX_TOASTS));
      for (const toast of shown) timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), VISIBLE_MS));
    }, 0);
  }, [summary, loaded, chat, dismiss]);

  useEffect(() => { const current = timers.current; return () => { for (const timer of current.values()) window.clearTimeout(timer); }; }, []);

  if (!toasts.length) return null;
  return (
    <div className="alert-stack" aria-live="polite" aria-label="Alertas nuevas">
      {toasts.map(toast => (
        <div key={toast.id} className="alert-toast" role="status">
          <button className="alert-main" onClick={() => { dismiss(toast.id); onOpenLink(toast.link); }}>
            <span className="alert-badge" aria-hidden="true"><Icon name={toast.message ? 'chat' : 'bell'} size={18} /></span>
            <span className="alert-text"><strong>{toast.title}</strong><span>{toast.body}</span><small>Ahora</small></span>
          </button>
          <button className="icon-button small" aria-label="Cerrar alerta" onClick={() => dismiss(toast.id)}><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
