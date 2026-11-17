'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { api, message, money } from '../service/market-client';

interface Insights {
  range: { from: string; to: string };
  selling: { listingsCreated: number; byKind: { fixed: number; auction: number; interest: number }; active: number; sold: number; revenue: number; averageDaysToSell: number | null; interests: number; bidsReceived: number; purchaseRequests: number; cancelledOperations: number };
  buying: { purchases: number; spent: number; bidsPlaced: number; auctionsWon: number; requestsMade: number };
  reputation: { count: number; average: number; completed: number };
  note: string;
}

export function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null), [error, setError] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      api<Insights>(`/api/market/insights?${params}`).then(value => { if (active) { setData(value); setError(''); } }).catch(e => { if (active) setError(message(e, 'No se pudo cargar el informe.')); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [from, to]);

  const card = (label: string, value: string, hint?: string) => <div className="report-metric" key={label}><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></div>;
  return (
    <div className="module-view market-view">
      <div className="module-title-row"><div><div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Informe del mercado</strong></div><h1>Informe del mercado</h1><p>Tu actividad como vendedor y comprador en el periodo.</p></div></div>
      <section className="panel notif-filters"><label className="form-field"><span>Desde</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="form-field"><span>Hasta</span><input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>{data && <span className="market-meta">Periodo: {data.range.from} a {data.range.to}</span>}</section>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {data && <>
        <h2 className="market-h2">Como vendedor</h2>
        <div className="insight-grid">
          {card('Ventas completadas', String(data.selling.sold))}{card('Ingresos', money(data.selling.revenue), 'solo operaciones completadas')}
          {card('Días promedio para vender', data.selling.averageDaysToSell === null ? '—' : String(data.selling.averageDaysToSell))}{card('Publicaciones creadas', String(data.selling.listingsCreated), `${data.selling.byKind.fixed} fijo · ${data.selling.byKind.auction} subasta · ${data.selling.byKind.interest} interés`)}
          {card('Publicaciones activas', String(data.selling.active))}{card('Interesados', String(data.selling.interests))}
          {card('Ofertas recibidas', String(data.selling.bidsReceived))}{card('Solicitudes de compra', String(data.selling.purchaseRequests))}
          {card('Operaciones canceladas', String(data.selling.cancelledOperations))}
        </div>
        <h2 className="market-h2">Como comprador</h2>
        <div className="insight-grid">{card('Compras completadas', String(data.buying.purchases))}{card('Gastado', money(data.buying.spent))}{card('Solicitudes hechas', String(data.buying.requestsMade))}{card('Ofertas hechas', String(data.buying.bidsPlaced))}{card('Subastas ganadas', String(data.buying.auctionsWon))}</div>
        <h2 className="market-h2">Reputación</h2>
        <div className="insight-grid">{card('Valoración promedio', data.reputation.count ? `★ ${data.reputation.average}` : 'Sin valoraciones', `${data.reputation.count} valoraciones`)}{card('Operaciones completadas', String(data.reputation.completed), 'en total')}</div>
        <p className="form-hint"><Icon name="alert" size={15} /> {data.note}</p>
      </>}
    </div>
  );
}
