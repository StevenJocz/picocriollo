'use client';
import { useCallback, useEffect, useState } from 'react';
import type { NotificationLink, NotificationRecord } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { api, message, shortDate } from '@/features/market/service/market-client';
import { CATEGORIES, CATEGORY_LABELS, PRIORITY_LABELS } from '../service/constants';

export function NotificationCenter({ onOpen, onChanged }: { onOpen: (link: NotificationLink) => void; onChanged: () => void }) {
  const [status, setStatus] = useState<'todas' | 'no_leidas' | 'leidas'>('todas'), [category, setCategory] = useState('');
  const [items, setItems] = useState<NotificationRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, limit: '100' });
    if (category) params.set('category', category);
    try { setItems((await api<{ items: NotificationRecord[] }>(`/api/notifications?${params}`)).items); setError(''); }
    catch (e) { setError(message(e, 'No se pudieron cargar las notificaciones.')); }
    finally { setLoading(false); }
  }, [status, category]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function open(item: NotificationRecord) {
    try { if (!item.readAt) { await api('/api/notifications', { method: 'POST', body: { action: 'read', ids: [item.id] } }); onChanged(); } } catch { /* abrir igualmente */ }
    onOpen(item.link);
  }
  async function readAll() {
    try { await api('/api/notifications', { method: 'POST', body: { action: 'read-all' } }); onChanged(); await load(); }
    catch (e) { setError(message(e, 'No se pudo marcar como leídas.')); }
  }

  return (
    <div className="module-view notif-view">
      <div className="module-title-row">
        <div>
          <div className="breadcrumb"><span>Cuenta</span><Icon name="arrow" size={13} /><strong>Notificaciones</strong></div>
          <h1>Notificaciones</h1>
          <p>Avisos de tu gallinero, incubaciones, mercado y transferencias.</p>
        </div>
        <button className="btn-secondary" onClick={() => void readAll()}><Icon name="check" size={16} />Marcar todas como leídas</button>
      </div>
      <section className="panel notif-filters">
        <select aria-label="Estado" value={status} onChange={e => { setStatus(e.target.value as typeof status); setLoading(true); }}><option value="todas">Todas</option><option value="no_leidas">No leídas</option><option value="leidas">Leídas</option></select>
        <select aria-label="Categoría" value={category} onChange={e => { setCategory(e.target.value); setLoading(true); }}><option value="">Todas las categorías</option>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select>
      </section>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando…</div>
        : items.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="bell" size={26} /></div><h3>Sin notificaciones</h3><p>Cuando haya novedades en tu granja o en el mercado aparecerán aquí.</p></div>
        : <ul className="notif-list">{items.map(item => (
          <li key={item.id}>
            <button className={`notif-item ${item.readAt ? '' : 'notif-unread'}`} onClick={() => void open(item)}>
              <span className={`notif-dot priority-${item.priority}`} aria-hidden="true" />
              <span className="notif-body">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <small>{CATEGORY_LABELS[item.category]} · {PRIORITY_LABELS[item.priority]} · {shortDate(item.createdAt)}</small>
              </span>
              {!item.readAt && <span className="status-pill pill-good">Nueva</span>}
            </button>
          </li>
        ))}</ul>}
    </div>
  );
}
