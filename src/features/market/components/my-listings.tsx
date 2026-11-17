'use client';
import { useDialogs } from '@/shared/components/dialogs';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone, remaining } from '@/shared/time';
import { STATUS_LABELS, type OwnListing } from '../service/public-view';
import { api, message, money, shortDate } from '../service/market-client';
import { BirdThumb } from './listing-card';
import { ListingDetail } from './listing-detail';
import { OperationsList } from './operations-list';
import { UserLink } from './user-link';

const FILTERS: [string, string][] = [
  ['todas', 'Todas'], ['borrador', 'Borrador'], ['publicada', 'Publicadas'], ['con_interesados', 'Con interesados'], ['con_ofertas', 'Con ofertas'], ['por_cerrar', 'Subasta por cerrar'],
  ['pendiente_confirmar', 'Venta pendiente de confirmar'], ['pendiente_pago', 'Pendiente de pago'], ['pendiente_entrega', 'Pendiente de entrega'],
  ['pausada', 'Pausadas'], ['requieren_revision', 'Requieren revisión'], ['vendida', 'Vendida y finalizada'], ['retirada', 'Retirada o cancelada'],
];
interface Interest { id: string; userId: string; alias: string; message: string; createdAt: string; }

export function MyListings({ onNotice, onNew }: { onNotice: (text: string) => void; onNew: () => void }) {
  const [filter, setFilter] = useState('todas'), [items, setItems] = useState<OwnListing[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [openInterests, setOpenInterests] = useState<string | null>(null), [interests, setInterests] = useState<Interest[]>([]), [busyId, setBusyId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const zone = useTimeZone();
  const dialogs = useDialogs();

  const load = useCallback(async () => {
    try { setItems((await api<{ items: OwnListing[] }>(`/api/market/mine?status=${filter}`)).items); setError(''); }
    catch (e) { setError(message(e, 'No se pudieron cargar tus publicaciones.')); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); const poll = window.setInterval(() => void load(), 30_000); return () => { window.clearTimeout(timer); window.clearInterval(poll); }; }, [load]);

  async function act(id: string, action: string, success: string, extra?: Record<string, unknown>) {
    setBusyId(id); setError('');
    try { await api(`/api/market/listings/${id}`, { method: 'PATCH', body: { action, ...extra } }); onNotice(success); await load(); }
    catch (e) { setError(message(e, 'No se pudo completar la acción.')); }
    finally { setBusyId(''); }
  }
  async function toggleInterests(id: string) {
    if (openInterests === id) { setOpenInterests(null); return; }
    try { setInterests((await api<{ items: Interest[] }>(`/api/market/listings/${id}/interest`)).items); setOpenInterests(id); }
    catch (e) { setError(message(e, 'No se pudieron cargar los interesados.')); }
  }
  async function editDescription(item: OwnListing) {
    const text = await dialogs.ask({ title: 'Descripción de la publicación', message: 'Cuéntale al comprador cómo es: temperamento, porte, plumaje, producción… (máximo 1200 caracteres).', label: 'Descripción', multiline: true, defaultValue: item.snapshot.description || '', placeholder: 'Escribe aquí la descripción', confirmLabel: 'Guardar', optional: true, maxLength: 1200 });
    if (text === null) return;
    void act(item.id, 'update', text.trim() ? 'Descripción actualizada.' : 'Descripción quitada.', { consent: { description: text.trim() } });
  }
  async function cancelAuction(item: OwnListing) {
    const hasBids = (item.auction?.bidCount ?? 0) > 0;
    const reason = hasBids ? await dialogs.ask({ title: 'Cancelar subasta', message: 'Esta subasta tiene ofertas. Indica el motivo de la cancelación; se avisará a los postores.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Cancelar subasta' }) : '';
    if (reason === null) return;
    void act(item.id, 'cancel-auction', 'Subasta cancelada.', { reason });
  }

  return (
    <div className="module-view market-view">
      <div className="module-title-row">
        <div>
          <div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mis publicaciones</strong></div>
          <h1>Mis publicaciones</h1>
          <p>Gestiona lo que tienes en venta: aves, lotes de aves, pollitos y huevos.</p>
        </div>
        <button className="btn-primary" onClick={onNew}><Icon name="plus" size={18} />Nueva publicación</button>
      </div>
      <div className="market-tabs" role="tablist">{FILTERS.map(([id, label]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'selected' : ''} onClick={() => { setFilter(id); setLoading(true); }}>{label}</button>)}</div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando…</div>
        : items.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="tag" size={26} /></div><h3>No hay publicaciones en esta vista</h3><p>Pulsa «Nueva publicación» para vender un ave, un lote de aves, pollitos o huevos.</p></div>
        : <div className="market-list">{items.map(item => {
          const auction = item.auction, hasBids = (auction?.bidCount ?? 0) > 0, editable = ['borrador', 'publicada', 'pausada'].includes(item.status);
          return (
          <article className="panel market-row" key={item.id}>
            <div className="market-row-main">
              <div className="market-thumb market-thumb-small"><BirdThumb listing={item} size={64} /></div>
              <div>
                <strong>{item.snapshot.title ?? item.snapshot.name}</strong>
                <span className="market-meta">{item.snapshot.breed}{item.snapshot.code ? ` · ${item.snapshot.code}` : ''}{item.kind === 'fixed' ? ` · ${money(item.price)}` : item.kind === 'auction' ? ` · ${hasBids ? 'Oferta actual' : 'Precio inicial'} ${money(auction?.currentPrice ?? item.price)}` : ' · Publicación de interés'}</span>
                {item.kind === 'auction' && item.closesAt && <span className="market-meta">{item.status === 'publicada' ? `Cierra ${formatInZone(item.closesAt, zone)} (${remaining(item.closesAt)})` : `Cierre: ${formatInZone(item.closesAt, zone)}`}</span>}
                <span className="market-pills">
                  <span className={`status-pill ${item.status === 'publicada' ? 'pill-good' : item.status === 'borrador' ? '' : 'pill-neutral'}`}>{STATUS_LABELS[item.status]}</span>
                  {hasBids && <span className="status-pill pill-good">{auction?.bidCount} oferta{auction?.bidCount === 1 ? '' : 's'}</span>}
                  {item.interestCount > 0 && <span className="status-pill pill-good">{item.interestCount} interesado{item.interestCount === 1 ? '' : 's'}</span>}
                  {item.pendingRequests > 0 && <span className="status-pill pill-warn">{item.pendingRequests} solicitud{item.pendingRequests === 1 ? '' : 'es'} por responder</span>}
                  {item.needsReview && <span className="status-pill pill-warn">Ficha cambiada: revisa</span>}
                  {item.closedReason && <span className="status-pill pill-neutral">{item.closedReason.replace(/_/g, ' ')}</span>}
                </span>
              </div>
            </div>
            <div className="market-row-actions">
              {item.needsReview && editable && !hasBids && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => void act(item.id, 'refresh', 'Publicación actualizada con la ficha actual.')}>Actualizar datos</button>}
              {editable && !(item.kind === 'auction' && hasBids) && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => void editDescription(item)}>{item.snapshot.description ? 'Editar descripción' : 'Agregar descripción'}</button>}
              {item.status === 'borrador' && <button className="btn-primary" disabled={busyId === item.id} onClick={() => void act(item.id, 'publish', 'Publicación activa en el mercado.')}>Publicar</button>}
              {item.status === 'publicada' && !hasBids && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => void act(item.id, 'pause', 'Publicación pausada.')}>Pausar</button>}
              {item.status === 'pausada' && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => void act(item.id, 'resume', 'Publicación reanudada.')}>Reanudar</button>}
              {editable && !(item.kind === 'auction' && hasBids) && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => { void dialogs.confirm({ title: 'Retirar publicación', message: '¿Retirar esta publicación? Lo publicado quedará disponible de nuevo.', confirmLabel: 'Retirar', danger: true }).then(ok => { if (ok) void act(item.id, 'withdraw', 'Publicación retirada.'); }); }}>Retirar</button>}
              {item.kind === 'auction' && hasBids && item.status === 'publicada' && <button className="btn-secondary" disabled={busyId === item.id} onClick={() => cancelAuction(item)}>Cancelar subasta</button>}
              {item.status === 'publicada' && <button className="btn-secondary" onClick={() => void toggleInterests(item.id)}>{openInterests === item.id ? 'Ocultar interesados' : 'Ver interesados'}</button>}
              {item.status !== 'borrador' && <button className="btn-secondary" onClick={() => setPreview(item.id)}>Ver publicación</button>}
            </div>
            {openInterests === item.id && (
              <ul className="market-interests">
                {interests.length === 0 ? <li>Aún no hay interesados.</li> : interests.map(row => <li key={row.id}><strong><UserLink id={row.userId} name={row.alias} /></strong> <small>{shortDate(row.createdAt)}</small>{row.message && <p>«{row.message}»</p>}</li>)}
              </ul>
            )}
          </article>);
        })}</div>}
      <section className="market-section">
        <h2>Operaciones de venta</h2>
        <p className="market-meta">Solicitudes de compra, subastas adjudicadas y ventas en curso. Acepta solo lo que quieras vender.</p>
        <OperationsList role="vendedor" onNotice={onNotice} onChanged={() => void load()} emptyText="Aquí aparecerán las solicitudes de compra y las subastas ganadas por compradores." />
      </section>
      {preview && <ListingDetail id={preview} onClose={() => setPreview(null)} onNotice={onNotice} />}
    </div>
  );
}
