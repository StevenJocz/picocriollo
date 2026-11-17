'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { ThreadSummary } from '../service/messages';
import { api, message } from '../service/market-client';
import { Conversation } from './conversation';

export function MessagesPage({ initialThread }: { initialThread?: string }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState<string | null>(initialThread ?? null);
  const zone = useTimeZone();
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await api<{ items: ThreadSummary[] }>('/api/market/threads'); if (active) { setThreads(result.items); setError(''); } }
      catch (e) { if (active) setError(message(e, 'No se pudieron cargar los mensajes.')); }
      finally { if (active) setLoading(false); }
    };
    const first = window.setTimeout(() => void load(), 0), poll = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(poll); };
  }, []);

  return (
    <div className="module-view market-view">
      <div className="module-title-row"><div><div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mensajes</strong></div><h1>Mensajes</h1><p>Una conversación por publicación y comprador. No se comparten teléfono ni correo hasta aceptar la operación.</p></div></div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando…</div>
        : threads.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="list" size={26} /></div><h3>Sin conversaciones</h3><p>Abre una publicación y pulsa «Contactar al vendedor» para escribirle.</p></div>
        : <div className="messages-layout">
            <ul className="notif-list">{threads.map(thread => (
              <li key={thread.id}><button className={`notif-item ${selected === thread.id ? 'notif-unread' : ''}`} onClick={() => setSelected(thread.id)}>
                <span className="notif-body"><strong>{thread.listingName} · {thread.counterpart}</strong><span>{thread.lastMessage}</span><small>{thread.role === 'vendedor' ? 'Como vendedor' : 'Como comprador'} · {formatInZone(thread.lastAt, zone)}</small></span>
              </button></li>
            ))}</ul>
            <div className="panel">{selected ? <Conversation key={selected} threadId={selected} /> : <p className="conversation-empty">Elige una conversación.</p>}</div>
          </div>}
    </div>
  );
}
