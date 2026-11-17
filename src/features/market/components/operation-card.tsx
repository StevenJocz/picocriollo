'use client';
import { useDialogs } from '@/shared/components/dialogs';
import { useState } from 'react';
import Image from 'next/image';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { OperationView } from '../service/operations';
import { OPERATION_HINTS, OPERATION_LABELS } from '../service/operation-labels';
import { api, message, money } from '../service/market-client';
import { Conversation } from './conversation';
import { useChat } from './chat-dock';
import { UserLink } from './user-link';

import { BirdGlyph } from '@/shared/components/glyph';
const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Bancolombia'];
export interface OperationAction { id: string; label: string; primary?: boolean; confirm?: string; prompt?: string; }

// Acciones según rol y estado. El servidor vuelve a validar cada una: esto solo decide qué botones mostrar.
export function actionsFor(op: Pick<OperationView, 'role' | 'status'>): OperationAction[] {
  const seller = op.role === 'vendedor';
  switch (op.status) {
    case 'solicitud_recibida': return seller ? [{ id: 'accept', label: 'Aceptar', primary: true }, { id: 'reject', label: 'Rechazar' }] : [{ id: 'withdraw', label: 'Retirar solicitud' }];
    case 'aceptada': case 'pago_pendiente': return [...(seller ? [] : [{ id: 'declare-payment', label: 'Declarar pago realizado', primary: true, prompt: 'Medio de pago usado (efectivo, transferencia, otro):' }]), { id: 'cancel', label: 'Cancelar operación', prompt: 'Motivo de la cancelación (mínimo 10 caracteres):' }];
    case 'pago_registrado': return [...(seller ? [{ id: 'confirm-payment', label: 'Confirmar que recibí el pago', primary: true, confirm: 'Confirma solo si el dinero ya está en tu poder. Pico Criollo no verifica pagos.' }] : []), { id: 'cancel', label: 'Cancelar operación', prompt: 'Motivo de la cancelación (mínimo 10 caracteres):' }];
    case 'entrega_pendiente': return [...(seller ? [{ id: 'deliver', label: 'Marcar ave entregada', primary: true }] : []), { id: 'cancel', label: 'Cancelar operación', prompt: 'Motivo de la cancelación (mínimo 10 caracteres):' }, { id: 'dispute', label: 'Abrir disputa', prompt: 'Describe el problema (mínimo 10 caracteres):' }];
    case 'entrega_confirmada': return [...(seller ? [] : [{ id: 'receive', label: 'Confirmar recepción del ave', primary: true, confirm: 'Al confirmar, la propiedad del ave se transfiere a tu cuenta.' }]), { id: 'dispute', label: 'Abrir disputa', prompt: 'Describe el problema (mínimo 10 caracteres):' }];
    default: return [];
  }
}

export function OperationCard({ op, onAction, busy }: { op: OperationView; onAction: (op: OperationView, action: string, extra?: Record<string, string>) => Promise<void>; busy: boolean }) {
  const zone = useTimeZone();
  const dock = useChat();
  const dialogs = useDialogs();
  const [chat, setChat] = useState(false), [error, setError] = useState(''), [contact, setContact] = useState<{ alias: string; email: string; phone: string | null } | null>(null);
  const inProgress = ['pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada'].includes(op.status);

  async function showContact() {
    setError('');
    try { setContact(await api(`/api/market/operations/${op.id}/contact`)); }
    catch (e) { setError(message(e, 'No se pudo obtener el contacto.')); }
  }

  async function perform(action: OperationAction) {
    setError('');
    let extra: Record<string, string> | undefined;
    if (action.confirm && !(await dialogs.confirm({ title: action.label, message: action.confirm, confirmLabel: action.label }))) return;
    if (action.prompt) {
      const payment = action.id === 'declare-payment';
      const answer = await dialogs.ask({
        title: action.label, message: action.prompt.replace(/:\s*$/, ''), label: payment ? 'Medio de pago' : 'Motivo', multiline: !payment,
        minLength: payment ? 2 : 10, maxLength: payment ? 60 : 500, suggestions: payment ? PAYMENT_METHODS : undefined, confirmLabel: action.label,
      });
      if (answer === null) return;
      extra = payment ? { method: answer } : { reason: answer };
    }
    try { await onAction(op, action.id, extra); } catch (e) { setError(message(e, 'No se pudo completar la acción.')); }
  }

  const final = op.status === 'completada' || op.status === 'cancelada';
  const [rated, setRated] = useState(false);

  async function rate() {
    const result = await dialogs.rate({ title: `Valorar a ${op.counterpart}`, message: 'Tu valoración se basa en esta operación completada.' });
    if (!result) return;
    setError('');
    try { await api(`/api/market/operations/${op.id}/rating`, { method: 'POST', body: { stars: result.stars, comment: result.comment } }); setRated(true); dialogs.notify('Valoración enviada. ¡Gracias!'); }
    catch (e) { setError(message(e, 'No se pudo registrar la valoración.')); }
  }
  async function reportUser() {
    const reason = await dialogs.ask({ title: `Denunciar a ${op.counterpart}`, message: 'Un moderador lo revisará.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    setError('');
    try { await api('/api/market/reports', { method: 'POST', body: { targetType: 'user', targetId: op.counterpartId, reason } }); dialogs.notify('Denuncia enviada. Un moderador la revisará.'); }
    catch (e) { setError(message(e, 'No se pudo enviar la denuncia.')); }
  }
  return (
    <article className="panel op-card">
      <div className="op-main">
        <div className="market-thumb market-thumb-small">{op.photoUrl ? <Image src={op.photoUrl} alt="" width={64} height={64} unoptimized className="market-thumb-img" /> : <span className="market-thumb-fallback" aria-hidden="true"><BirdGlyph kind="gallina" /></span>}</div>
        <div className="op-info">
          <strong>{op.birdName} <small>{op.birdCode}</small></strong>
          <span className="market-meta">{op.role === 'comprador' ? 'Vendedor' : 'Comprador'}: <UserLink id={op.counterpartId} name={op.counterpart} /> · {money(op.price)} · {op.origin === 'subasta' ? 'Subasta' : 'Compra directa'}</span>
          <span className="market-pills"><span className={`status-pill ${op.status === 'completada' ? 'pill-good' : op.status === 'cancelada' ? 'pill-neutral' : op.status === 'disputada' ? 'pill-warn' : ''}`}>{OPERATION_LABELS[op.status]}</span></span>
          {OPERATION_HINTS[op.status] && <small className="op-hint">{OPERATION_HINTS[op.status]}</small>}
          {op.cancelReason && <small className="op-hint">Motivo: {op.cancelReason}</small>}
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="market-row-actions">
        {op.invoiceNumber && <a className="btn-primary" href={`/facturas/${op.invoiceNumber}`} target="_blank" rel="noreferrer">Ver factura {op.invoiceNumber}</a>}
        {op.receiptCode && <a className="btn-secondary" href={`/transferencias/${op.receiptCode}`} target="_blank" rel="noreferrer">Ver comprobante {op.receiptCode}</a>}
        {actionsFor(op).map(action => <button key={action.id} className={action.primary ? 'btn-primary' : 'btn-secondary'} disabled={busy} onClick={() => void perform(action)}>{action.label}</button>)}
        {op.status === 'completada' && op.rating?.canRate && !rated && <button className="btn-primary" onClick={() => void rate()}>Valorar a {op.counterpart}</button>}
        {op.status === 'completada' && op.rating?.canRate && !rated && op.role === 'comprador' && <small className="op-hint">Tu opinión será pública en el perfil del vendedor cuando el otro participante también califique o venza el plazo de 14 días.</small>}
        {op.rating?.mine && <span className="status-pill pill-good">Valoraste {op.rating.mine.stars}/5</span>}
        {op.rating?.theirs && <span className="status-pill pill-neutral">Te valoraron {op.rating.theirs.stars}/5{op.rating.theirs.comment ? `: «${op.rating.theirs.comment}»` : ''}</span>}
        <button className="btn-secondary" onClick={() => void reportUser()}>Denunciar usuario</button>
        {inProgress && <button className="btn-secondary" disabled={busy} aria-busy={busy} onClick={() => void onAction(op, 'share-contact').catch(e => setError(message(e, 'No se pudo registrar tu autorización.')))}>Autorizar compartir mi contacto</button>}
        {inProgress && <button className="btn-secondary" onClick={() => void showContact()}>Ver contacto</button>}
        {!final && <button className="btn-secondary" onClick={() => { const title = `${op.counterpart} · ${op.birdName}`; if (dock && op.threadId) dock.openThread(op.threadId, title); else if (dock && op.role === 'comprador') dock.openListing(op.listingId, title); else setChat(value => !value); }}>{!dock && chat ? 'Ocultar mensajes' : 'Mensajes'}</button>}
      </div>
      {contact && <p className="market-owner-note">Contacto de {contact.alias}: {contact.email}{contact.phone ? ` · ${contact.phone}` : ''}. Úsalo solo para esta operación.</p>}
      {chat && !dock && <Conversation listingId={op.role === 'comprador' ? op.listingId : undefined} threadId={op.threadId} />}
      <details className="op-history"><summary>Historial ({op.history.length})</summary><ul>{op.history.map((entry, index) => <li key={index}><span>{formatInZone(entry.at, zone, true)}</span> {OPERATION_LABELS[entry.status]}{entry.note ? ` · ${entry.note}` : ''}</li>)}</ul></details>
    </article>
  );
}
