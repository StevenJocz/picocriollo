'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationLink, NotificationRecord } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { useDismiss } from '@/shared/hooks/use-dismiss';
import { api, message, shortDate } from '@/features/market/service/market-client';
import { CATEGORY_LABELS } from '../service/constants';

// Campana con panel desplegable (como Facebook): últimas notificaciones, marcar como leídas y enlace al historial completo.
export function NotificationBell({ unread, onOpenLink, onViewAll, onChanged }: { unread: number; onOpenLink: (link: NotificationLink) => void; onViewAll: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'todas' | 'no_leidas'>('todas');
  const [items, setItems] = useState<NotificationRecord[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: NotificationRecord[] }>(`/api/notifications?status=${tab}&limit=20`)).items.filter(item => item.type !== 'market.message.created')); setError(''); }
    catch (e) { setError(message(e, 'No se pudieron cargar las notificaciones.')); }
    finally { setLoading(false); }
  }, [tab]);
  // Se recarga al abrir, al cambiar de pestaña y cuando cambia el contador (llegó algo nuevo).
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [open, load, unread]);

  async function openItem(item: NotificationRecord) {
    try { if (!item.readAt) { await api('/api/notifications', { method: 'POST', body: { action: 'read', ids: [item.id] } }); onChanged(); } } catch { /* abrir igualmente */ }
    setOpen(false);
    onOpenLink(item.link);
  }
  async function readAll() {
    try { await api('/api/notifications', { method: 'POST', body: { action: 'read-all' } }); onChanged(); await load(); }
    catch (e) { setError(message(e, 'No se pudo marcar como leídas.')); }
  }

  return (
    <div className="popover-anchor" ref={box}>
      <button className={`notification-button ${open ? 'notification-open' : ''}`} aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(value => !value); setLoading(true); }}>
        <Icon name="bell" size={19} />{unread > 0 && <b className="bell-count">{unread > 99 ? '99+' : unread}</b>}
      </button>
      {open && (
        <section className="popover-panel notif-popover" role="dialog" aria-label="Notificaciones">
          <header>
            <h2>Notificaciones</h2>
            <button className="text-link" onClick={() => void readAll()}><Icon name="check" size={14} />Marcar todas como leídas</button>
          </header>
          <div className="popover-tabs" role="tablist">
            {([['todas', 'Todas'], ['no_leidas', 'No leídas']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => { setTab(id); setLoading(true); }}>{label}</button>)}
          </div>
          {error && <div className="form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
          <div className="popover-list">
            {loading && items.length === 0 ? <div className="loading-state popover-empty"><span className="spinner" />Cargando…</div>
              : items.length === 0 ? <div className="popover-empty"><Icon name="bell" size={22} /><p>{tab === 'no_leidas' ? 'No tienes notificaciones sin leer.' : 'Sin notificaciones por ahora.'}</p></div>
              : items.map(item => (
                <button key={item.id} className={`popover-item ${item.readAt ? '' : 'popover-unread'}`} onClick={() => void openItem(item)}>
                  <span className={`popover-icon priority-${item.priority}`} aria-hidden="true"><Icon name="bell" size={16} /></span>
                  <span className="popover-text"><strong>{item.title}</strong><span>{item.body}</span><small>{CATEGORY_LABELS[item.category]} · {shortDate(item.createdAt)}</small></span>
                  {!item.readAt && <i className="popover-dot" aria-label="Sin leer" />}
                </button>
              ))}
          </div>
          <footer><button className="text-link" onClick={() => { setOpen(false); onViewAll(); }}>Ver todas las notificaciones</button></footer>
        </section>
      )}
    </div>
  );
}
