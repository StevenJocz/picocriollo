'use client';
import { useEffect, useState } from 'react';
import type { Bird } from '@/models/farm';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { api, message } from '../service/market-client';

interface Ancestor { name: string; code: string; breed: string; mother?: Ancestor | null; father?: Ancestor | null; }
interface Provenance { owners: { alias: string; from: string; to: string | null; mine: boolean; viaOperation: boolean }[]; passport: { code: string; originRing: number | null; lineage: { mother?: Ancestor | null; father?: Ancestor | null; declaredBy?: string }; updatedAt: string } | null; }

function Tree({ label, node }: { label: string; node?: Ancestor | null }) {
  if (!node) return <li><span>{label}</span><em>No registrado</em></li>;
  return <li><span>{label}</span><strong>{node.name}</strong> <small>{node.breed} · {node.code}</small>{(node.mother || node.father) && <ul><Tree label="Madre" node={node.mother} /><Tree label="Padre" node={node.father} /></ul>}</li>;
}

export function ProvenanceDialog({ bird, onClose }: { bird: Bird; onClose: () => void }) {
  const [data, setData] = useState<Provenance | null>(null), [error, setError] = useState('');
  const zone = useTimeZone();
  useEffect(() => {
    let active = true;
    api<Provenance>(`/api/birds/${encodeURIComponent(bird.id)}/provenance`).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(message(e, 'No se pudo cargar la procedencia.')); });
    return () => { active = false; };
  }, [bird.id]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="record-dialog" role="dialog" aria-modal="true" aria-label="Procedencia y propietarios">
        <div className="dialog-top"><div><span className="eyebrow">PROCEDENCIA Y PROPIETARIOS</span><h2>{bird.name} <small>{bird.code}</small></h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        {!data && !error && <div className="loading-state"><span className="spinner" />Cargando…</div>}
        {data && <>
          <section className="market-detail"><h3>Propietarios por periodo</h3>
            <ul className="bid-history">{data.owners.map((row, index) => <li key={index} className={row.mine ? 'bid-mine' : ''}><span>{row.alias}{row.mine ? ' (tú)' : ''}{row.viaOperation ? ' · por transferencia' : ''}</span><strong>{formatInZone(row.from, zone, true)}</strong><small>{row.to ? `hasta ${formatInZone(row.to, zone, true)}` : 'actual'}</small></li>)}</ul>
          </section>
          {data.passport ? <section className="market-detail"><h3>Pasaporte del ave</h3>
            <p>Código permanente {data.passport.code}{data.passport.originRing ? ` · anillo original ${data.passport.originRing}` : ''}. Genealogía declarada por {data.passport.lineage.declaredBy ?? 'el vendedor anterior'}; no verificada por Pico Criollo.</p>
            <ul className="market-lineage"><Tree label="Madre" node={data.passport.lineage.mother} /><Tree label="Padre" node={data.passport.lineage.father} /></ul></section>
            : <p className="form-hint"><Icon name="leaf" size={15} /> Esta ave aún no se ha transferido: no tiene pasaporte de procedencia. Se crea al completar una venta.</p>}
        </>}
      </section>
    </div>
  );
}
