'use client';
import { useDialogs } from '@/shared/components/dialogs';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { ReportView } from '../service/moderation';
import { api, message, money } from '../service/market-client';

interface Dispute { id: string; bird: string; price: number; reason: string; buyer: string; seller: string; updatedAt: string; history: { at: string; status: string; note?: string }[]; }
const ACTIONS: Record<ReportView['targetType'], [string, string][]> = {
  listing: [['pause', 'Pausar'], ['reject', 'Rechazar'], ['withdraw', 'Retirar'], ['restore', 'Reanudar'], ['dismiss', 'Descartar']],
  message: [['hide', 'Ocultar mensaje'], ['dismiss', 'Descartar']],
  post: [['hide', 'Ocultar publicación'], ['dismiss', 'Descartar']],
  comment: [['hide', 'Ocultar comentario'], ['dismiss', 'Descartar']],
  user: [['warn', 'Advertir'], ['suspend', 'Restringir cuenta'], ['unsuspend', 'Levantar restricción'], ['dismiss', 'Descartar']],
};
const TYPE_LABEL = { listing: 'Publicación', user: 'Usuario', message: 'Mensaje', post: 'Publicación del perfil', comment: 'Comentario' } as const;

// Panel para moderadores y administradores. El servidor vuelve a comprobar el rol en cada llamada.
export function ModerationPage({ onNotice }: { onNotice: (text: string) => void }) {
  const dialogs = useDialogs();
  const [tab, setTab] = useState<'reportes' | 'disputas'>('reportes'), [status, setStatus] = useState('abierta');
  const [reports, setReports] = useState<ReportView[]>([]), [disputes, setDisputes] = useState<Dispute[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const zone = useTimeZone();

  const load = useCallback(async () => {
    try {
      if (tab === 'reportes') setReports((await api<{ items: ReportView[] }>(`/api/moderation/reports?status=${status}`)).items);
      else setDisputes((await api<{ items: Dispute[] }>('/api/moderation/disputes')).items);
      setError('');
    } catch (e) { setError(message(e, 'No se pudo cargar el panel de moderación.')); }
    finally { setLoading(false); }
  }, [tab, status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function resolve(report: ReportView, action: string) {
    const note = await dialogs.ask({ title: 'Nota de moderación', message: `Nota de moderación para «${action}» (queda en la auditoría):`, label: 'Nota (queda en la auditoría)', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Resolver' });
    if (note === null) return;
    try { await api(`/api/moderation/reports/${report.id}`, { method: 'PATCH', body: { action, note } }); onNotice('Denuncia resuelta y registrada.'); await load(); }
    catch (e) { setError(message(e, 'No se pudo resolver la denuncia.')); }
  }
  async function settle(dispute: Dispute, decision: 'cancel' | 'resume') {
    const note = await dialogs.ask({ title: 'Resolver disputa', message: decision === 'cancel' ? 'Nota: la operación se cancelará y el ave quedará libre.' : 'Nota: la operación se reanuda donde estaba.', label: 'Nota (queda en la auditoría)', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Resolver' });
    if (note === null) return;
    try { await api(`/api/moderation/disputes/${dispute.id}`, { method: 'PATCH', body: { decision, note } }); onNotice('Disputa resuelta.'); await load(); }
    catch (e) { setError(message(e, 'No se pudo resolver la disputa.')); }
  }

  return (
    <div className="module-view market-view">
      <div className="module-title-row"><div><div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Moderación</strong></div><h1>Moderación</h1><p>Denuncias y disputas. Cada decisión exige una nota y queda en la auditoría.</p></div></div>
      <div className="market-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reportes'} className={tab === 'reportes' ? 'selected' : ''} onClick={() => { setTab('reportes'); setLoading(true); }}>Denuncias</button>
        <button role="tab" aria-selected={tab === 'disputas'} className={tab === 'disputas' ? 'selected' : ''} onClick={() => { setTab('disputas'); setLoading(true); }}>Disputas de operaciones</button>
        {tab === 'reportes' && <select aria-label="Estado" value={status} onChange={e => { setStatus(e.target.value); setLoading(true); }}><option value="abierta">Abiertas</option><option value="resuelta">Resueltas</option><option value="descartada">Descartadas</option><option value="todas">Todas</option></select>}
      </div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando…</div>
        : tab === 'reportes' ? (reports.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="check" size={26} /></div><h3>Sin denuncias en esta vista</h3></div>
          : <div className="market-list">{reports.map(report => (
            <article className="panel market-row" key={report.id}>
              <div className="op-info">
                <strong>{TYPE_LABEL[report.targetType]}: {report.target}</strong>
                <span className="market-meta">Denuncia de {report.reporter} · {formatInZone(report.createdAt, zone, true)}{report.sameTargetReports > 1 ? ` · ${report.sameTargetReports} denuncias sobre lo mismo` : ''}</span>
                <p>{report.reason}</p>
                <span className="market-pills"><span className={`status-pill ${report.status === 'abierta' ? 'pill-warn' : 'pill-neutral'}`}>{report.status}</span>{report.resolution && <span className="status-pill pill-neutral">{report.resolution}</span>}</span>
              </div>
              {report.status === 'abierta' && <div className="market-row-actions">{ACTIONS[report.targetType].map(([action, label]) => <button key={action} className="btn-secondary" onClick={() => void resolve(report, action)}>{label}</button>)}</div>}
            </article>))}</div>)
        : (disputes.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="check" size={26} /></div><h3>Sin disputas abiertas</h3></div>
          : <div className="market-list">{disputes.map(dispute => (
            <article className="panel market-row" key={dispute.id}>
              <div className="op-info"><strong>{dispute.bird} · {money(dispute.price)}</strong><span className="market-meta">Vendedor {dispute.seller} · Comprador {dispute.buyer} · {formatInZone(dispute.updatedAt, zone, true)}</span><p>{dispute.reason}</p>
                <details className="op-history"><summary>Historial ({dispute.history.length})</summary><ul>{dispute.history.map((entry, index) => <li key={index}><span>{formatInZone(entry.at, zone, true)}</span> {entry.status}{entry.note ? ` · ${entry.note}` : ''}</li>)}</ul></details>
              </div>
              <div className="market-row-actions"><button className="btn-secondary" onClick={() => void settle(dispute, 'resume')}>Reanudar operación</button><button className="btn-primary" onClick={() => void settle(dispute, 'cancel')}>Cancelar y liberar el ave</button></div>
            </article>))}</div>)}
    </div>
  );
}
