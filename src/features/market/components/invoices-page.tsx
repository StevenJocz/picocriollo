'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { InvoiceSummary } from '../service/invoices';
import { api, message, money } from '../service/market-client';
import { UserLink } from './user-link';

const TABS: [string, string][] = [['', 'Todas'], ['comprador', 'Compras'], ['vendedor', 'Ventas']];

// «Mis facturas»: las facturas POS internas de las compras y ventas completadas en el mercado.
export function InvoicesPage() {
  const [role, setRole] = useState(''), [items, setItems] = useState<InvoiceSummary[]>([]), [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const zone = useTimeZone();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      api<InvoiceSummary[]>(`/api/market/invoices${role ? `?role=${role}` : ''}`)
        .then(rows => { if (active) { setItems(rows); setError(''); } })
        .catch(e => { if (active) setError(message(e, 'No se pudieron cargar tus facturas.')); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [role]);

  const needle = query.trim().toLocaleLowerCase('es-CO');
  const rows = items.filter(row => !needle || `${row.number} ${row.title} ${row.counterpart}`.toLocaleLowerCase('es-CO').includes(needle));

  return (
    <div className="module-view market-view">
      <div className="module-title-row">
        <div>
          <div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mis facturas</strong></div>
          <h1>Mis facturas</h1>
          <p>Se generan solas cuando se completa una compra o venta en el mercado. Las ven el comprador y el vendedor.</p>
        </div>
      </div>
      <div className="market-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id || 'todas'} role="tab" aria-selected={role === id} className={role === id ? 'selected' : ''} onClick={() => { setRole(id); setLoading(true); }}>{label}</button>)}</div>
      <section className="panel market-filters"><div className="search-box"><Icon name="search" size={17} /><input aria-label="Buscar facturas" placeholder="Buscar por número, concepto o persona…" value={query} onChange={e => setQuery(e.target.value)} /></div></section>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando facturas…</div>
        : rows.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="receipt" size={26} /></div><h3>{items.length ? 'Ninguna factura coincide' : 'Aún no tienes facturas'}</h3><p>{items.length ? 'Prueba con otra búsqueda.' : 'Se generan cuando se completa una venta o compra del mercado.'}</p></div>
        : (
          <div className="invoice-table-wrap">
            <table className="invoice-table">
              <thead><tr><th>Número</th><th>Fecha</th><th>Concepto</th><th>Contraparte</th><th className="num">Total</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>{rows.map(row => (
                <tr key={row.number}>
                  <td><strong>{row.number}</strong><small>{row.role === 'comprador' ? 'Compra' : 'Venta'}</small></td>
                  <td>{formatInZone(row.issuedAt, zone, true)}</td>
                  <td>{row.title}</td>
                  <td><UserLink id={row.counterpartId} name={row.counterpart} /></td>
                  <td className="num">{money(row.total)}</td>
                  <td><Link className="btn-secondary" href={`/facturas/${row.number}`}>Ver</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
    </div>
  );
}
