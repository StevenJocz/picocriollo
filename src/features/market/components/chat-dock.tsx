'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDismiss } from '@/shared/hooks/use-dismiss';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { ThreadSummary } from '../service/messages';
import { api, message } from '../service/market-client';
import { Conversation } from './conversation';
import { UserLink } from './user-link';
import { Avatar } from '@/features/profile/components/avatar';

const MAX_WINDOWS = 3;
const MESSAGE_EVENT = 'market.message.created';

interface ChatWindow { key: string; threadId?: string; listingId?: string; title: string; minimized: boolean; unread: boolean; peer?: { id: string; alias: string; avatarUrl?: string }; }
export interface ChatApi {
  windows: ChatWindow[];
  openThread: (threadId: string, title?: string) => void;
  openListing: (listingId: string, title: string) => void;
  /** Un mensaje nuevo llegó a la conversación: devuelve si su ventana está a la vista (no hace falta avisar) o no. */
  incoming: (threadId: string) => 'visible' | 'minimized' | 'closed';
}
const ChatContext = createContext<ChatApi | null>(null);
/** Devuelve null fuera de la aplicación (p. ej. el catálogo público): quien lo use debe tener una alternativa en línea. */
export const useChat = () => useContext(ChatContext);

const sameWindow = (w: ChatWindow, ref: { threadId?: string; listingId?: string }) => Boolean((ref.threadId && w.threadId === ref.threadId) || (ref.listingId && !w.threadId && w.listingId === ref.listingId));

// Ventanas de chat acopladas abajo a la derecha, como Messenger. Máximo 3 a la vez: la más antigua se cierra.
export function ChatProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<ChatWindow[]>([]);
  const ref = useRef(windows);
  useEffect(() => { ref.current = windows; }, [windows]);

  const markRead = useCallback((threadId: string) => {
    api('/api/notifications', { method: 'POST', body: { action: 'read-link', type: MESSAGE_EVENT, linkId: threadId } }).then(() => window.dispatchEvent(new Event('pico-notifications-refresh'))).catch(() => undefined);
  }, []);

  const open = useCallback((target: { threadId?: string; listingId?: string }, title: string) => {
    setWindows(current => {
      const found = current.find(w => sameWindow(w, target));
      if (found) return [...current.filter(w => w !== found), { ...found, minimized: false, unread: false, title: found.title === 'Conversación' ? title : found.title }];
      const next = [...current, { key: `${target.threadId ?? target.listingId}-${Date.now()}`, ...target, title, minimized: false, unread: false }];
      return next.slice(-MAX_WINDOWS);
    });
    if (target.threadId) markRead(target.threadId);
  }, [markRead]);

  const api_ = useMemo<ChatApi>(() => ({
    windows,
    openThread: (threadId, title = 'Conversación') => open({ threadId }, title),
    openListing: (listingId, title) => open({ listingId }, title),
    incoming: threadId => {
      const found = ref.current.find(w => w.threadId === threadId);
      if (!found) return 'closed';
      if (found.minimized) { setWindows(current => current.map(w => w.threadId === threadId ? { ...w, unread: true } : w)); return 'minimized'; }
      markRead(threadId);
      return 'visible';
    },
  }), [windows, open, markRead]);

  return (
    <ChatContext.Provider value={api_}>
      {children}
      <ChatDock windows={windows} setWindows={setWindows} markRead={markRead} />
    </ChatContext.Provider>
  );
}

function ChatDock({ windows, setWindows, markRead }: { windows: ChatWindow[]; setWindows: (update: (current: ChatWindow[]) => ChatWindow[]) => void; markRead: (threadId: string) => void }) {
  if (windows.length === 0) return null;
  const patch = (key: string, change: Partial<ChatWindow>) => setWindows(current => current.map(w => w.key === key ? { ...w, ...change } : w));
  return (
    <div className="chat-dock" role="region" aria-label="Conversaciones">
      {[...windows].reverse().map(win => (
        <section key={win.key} className={`chat-window ${win.minimized ? 'chat-minimized' : ''}`} aria-label={`Chat: ${win.title}`}>
          <header className={win.unread ? 'chat-unread' : ''}>
            <button className="chat-title" onClick={() => { patch(win.key, { minimized: !win.minimized, unread: false }); if (win.minimized && win.threadId) markRead(win.threadId); }} aria-expanded={!win.minimized}>
              <span className="chat-avatar" aria-hidden="true">{win.peer ? <Avatar url={win.peer.avatarUrl} name={win.peer.alias} size={28} /> : <Icon name="user" size={14} />}</span>
              <strong>{win.title}</strong>{win.unread && <i className="popover-dot" aria-label="Mensaje nuevo" />}
            </button>
            <button className="icon-button small" aria-label={win.minimized ? 'Expandir chat' : 'Minimizar chat'} onClick={() => patch(win.key, { minimized: !win.minimized, unread: false })}><Icon name={win.minimized ? 'plus' : 'minus'} size={15} /></button>
            <button className="icon-button small" aria-label="Cerrar chat" onClick={() => setWindows(current => current.filter(w => w.key !== win.key))}><Icon name="close" size={15} /></button>
          </header>
          {!win.minimized && (
            <div className="chat-body">
              <Conversation
                key={win.key} threadId={win.threadId} listingId={win.listingId} pollMs={5000}
                onLoaded={data => { if (win.title === 'Conversación') patch(win.key, { title: data.listingName }); if (data.counterpart && win.peer?.id !== data.counterpart.id) patch(win.key, { peer: data.counterpart }); }}
                onThread={id => patch(win.key, { threadId: id })}
              />
            </div>
          )}
          {win.peer && !win.minimized && <div className="chat-peer">Conversación con <UserLink id={win.peer.id} name={win.peer.alias} /></div>}
        </section>
      ))}
    </div>
  );
}

// Botón «Mensajes» de la barra superior: lista de conversaciones que abre ventanas laterales.
export function MessengerMenu({ unreadMessages, unreadThreads, onChanged }: { unreadMessages: number; unreadThreads: string[]; onChanged: () => void }) {
  const chat = useChat();
  const [open, setOpen] = useState(false), [threads, setThreads] = useState<ThreadSummary[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null), zone = useTimeZone();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try { const result = await api<{ items: ThreadSummary[] }>('/api/market/threads'); if (active) { setThreads(result.items); setError(''); } }
      catch (e) { if (active) setError(message(e, 'No se pudieron cargar los mensajes.')); }
      finally { if (active) setLoading(false); }
    };
    const first = window.setTimeout(() => void load(), 0), poll = window.setInterval(() => void load(), 10_000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(poll); };
  }, [open, unreadMessages]);

  if (!chat) return null;
  return (
    <div className="popover-anchor" ref={box}>
      <button className={`notification-button ${open ? 'notification-open' : ''}`} aria-label={unreadMessages > 0 ? `Mensajes: ${unreadMessages} sin leer` : 'Mensajes'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(value => !value); setLoading(true); }}>
        <Icon name="chat" size={19} />{unreadMessages > 0 && <b className="bell-count">{unreadMessages > 99 ? '99+' : unreadMessages}</b>}
      </button>
      {open && (
        <section className="popover-panel notif-popover" role="dialog" aria-label="Mensajes">
          <header><h2>Mensajes</h2></header>
          {error && <div className="form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
          <div className="popover-list">
            {loading && threads.length === 0 ? <div className="loading-state popover-empty"><span className="spinner" />Cargando…</div>
              : threads.length === 0 ? <div className="popover-empty"><Icon name="chat" size={22} /><p>Sin conversaciones. Abre una publicación y pulsa «Contactar al vendedor».</p></div>
              : threads.map(thread => {
                const unread = unreadThreads.includes(thread.id);
                return (
                  <button key={thread.id} className={`popover-item ${unread ? 'popover-unread' : ''}`} onClick={() => { chat.openThread(thread.id, `${thread.counterpart} · ${thread.listingName}`); setOpen(false); onChanged(); }}>
                    <span className="popover-icon popover-avatar" aria-hidden="true"><Avatar url={thread.counterpartAvatarUrl} name={thread.counterpart} size={38} /></span>
                    <span className="popover-text"><strong>{thread.counterpart}</strong><span>{thread.listingName} — {thread.lastMessage}</span><small>{thread.role === 'vendedor' ? 'Como vendedor' : 'Como comprador'} · {formatInZone(thread.lastAt, zone)}</small></span>
                    {unread && <i className="popover-dot" aria-label="Mensaje nuevo" />}
                  </button>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
