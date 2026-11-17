'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { api, message, money } from '../service/market-client';
import { ListingDetail } from './listing-detail';
import { UserLink } from './user-link';

interface MyBid { listingId: string; birdName: string; birdCode: string; sellerAlias: string; sellerId: string; closesAt?: string; listingStatus: string; myBest: number; currentPrice: number; phase: string; result: 'liderando' | 'superada' | 'ganadora' | 'no_ganadora'; cancelled?: boolean; }
const RESULT: Record<MyBid['result'], { label: string; tone: string }> = {
  liderando: { label: 'Vas liderando', tone: 'pill-good' }, superada: { label: 'Te superaron', tone: 'pill-warn' },
  ganadora: { label: 'Ganaste', tone: 'pill-good' }, no_ganadora: { label: 'No ganaste', tone: 'pill-neutral' },
};

export function OffersPage({ onNotice, onNavigate }: { onNotice: (text: string) => void; onNavigate: (view: string) => void }) {
  const [items, setItems] = useState<MyBid[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [open, setOpen] = useState<string | null>(null);
  const zone = useTimeZone();
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await api<{ items: MyBid[] }>('/api/market/bids/mine'); if (active) { setItems(result.items); setError(''); } }
      catch (e) { if (active) setError(message(e, 'No se pudieron cargar tus ofertas.')); }
      finally { if (active) setLoading(false); }
    };
    const first = window.setTimeout(() => void load(), 0), poll = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(poll); };
  }, [open]);

  return (
    <div className="module-view market-view">
      <div className="module-title-row">
        <div><div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mis ofertas y subastas</strong></div><h1>Mis ofertas y subastas</h1><p>Tus ofertas son vinculantes pero no son pagos: no se cobra nada al ofertar.</p></div>
        <button className="btn-secondary" onClick={() => onNavigate('mercado')}><Icon name="store" size={16} />Ver el mercado</button>
      </div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando…</div>
        : items.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="gavel" size={26} /></div><h3>Aún no has ofertado</h3><p>Entra al mercado y participa en una subasta abierta.</p></div>
        : <div className="market-list">{items.map(row => (
          <article className="panel market-row" key={row.listingId}>
            <div className="market-row-main"><div>
              <strong>{row.birdName} <small>{row.birdCode}</small></strong>
              <span className="market-meta">Vendedor <UserLink id={row.sellerId} name={row.sellerAlias} /> · Tu mejor oferta {money(row.myBest)} · Oferta actual {money(row.currentPrice)}</span>
              <span className="market-pills">
                <span className={`status-pill ${RESULT[row.result].tone}`}>{RESULT[row.result].label}</span>
                {row.cancelled && <span className="status-pill pill-warn">Subasta cancelada</span>}
                {row.closesAt && <span className="status-pill pill-neutral">{row.phase === 'abierta' ? 'Cierra' : 'Cerró'} {formatInZone(row.closesAt, zone)}</span>}
              </span>
            </div></div>
            <div className="market-row-actions">
              <button className="btn-secondary" onClick={() => setOpen(row.listingId)}>Ver subasta</button>
              {row.result === 'ganadora' && <button className="btn-primary" onClick={() => onNavigate('compras-mercado')}>Ir a mi compra</button>}
            </div>
          </article>
        ))}</div>}
      {open && <ListingDetail id={open} onClose={() => setOpen(null)} onNotice={onNotice} />}
    </div>
  );
}
