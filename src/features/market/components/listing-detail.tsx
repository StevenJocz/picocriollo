'use client';
import { SPECIES_LABELS, sexLabel, speciesOf } from '@/models/species';
import { LineageTree } from './lineage-tree';
import { useDialogs } from '@/shared/components/dialogs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { OperationStatus } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone, remaining } from '@/shared/time';
import { ITEM_LABELS, KIND_LABELS, type PublicListing } from '../service/public-view';
import { OPERATION_LABELS } from '../service/operation-labels';
import { api, message, money } from '../service/market-client';
import { PriceLabel } from './listing-card';
import { PhotoGallery } from './photo-gallery';
import { Conversation } from './conversation';
import { useChat } from './chat-dock';

import { glyphForItem } from '@/shared/components/glyph';
interface PublicBid { alias: string; amount: number; placedAt: string; status: string; mine: boolean; }
interface Detail {
  listing: PublicListing; bids: PublicBid[];
  viewer: { isOwner: boolean; signedIn: boolean; hasInterest: boolean; isTopBidder: boolean; operationId?: string; operationStatus?: OperationStatus; threadId?: string };
}

export function ListingDetail({ id, onClose, onNotice }: { id: string; onClose: () => void; onNotice?: (text: string) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [text, setText] = useState('');
  const [amount, setAmount] = useState(''), [now, setNow] = useState(() => new Date()), [chat, setChat] = useState(false), [asking, setAsking] = useState(false);
  const zone = useTimeZone();
  const dock = useChat();
  const dialogs = useDialogs();

  const load = useCallback(async () => {
    try { setDetail(await api<Detail>(`/api/market/${id}`)); setError(''); }
    catch (e) { setError(message(e, 'No se pudo cargar la publicación.')); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); const poll = window.setInterval(() => void load(), 30_000); return () => { window.clearTimeout(timer); window.clearInterval(poll); }; }, [load]);
  useEffect(() => { const tick = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(tick); }, []);

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true); setError('');
    try { await task(); onNotice?.(success); await load(); }
    catch (e) { setError(message(e, 'No se pudo completar la acción.')); await load(); }
    finally { setBusy(false); }
  }
  const report = async () => {
    const reason = await dialogs.ask({ title: 'Denunciar publicación', message: 'Describe qué tiene de engañosa o inapropiada esta publicación.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    await run(() => api('/api/market/reports', { method: 'POST', body: { targetType: 'listing', targetId: id, reason } }), 'Denuncia enviada. Un moderador la revisará.');
  };
  const interest = (action: 'add' | 'withdraw') => run(async () => { await api(`/api/market/listings/${id}/interest`, { method: 'POST', body: { action, message: text } }); setText(''); }, action === 'add' ? 'Interés enviado. El vendedor recibió una notificación.' : 'Retiraste tu interés.');
  const requestPurchase = () => run(async () => { await api(`/api/market/listings/${id}/purchase`, { method: 'POST', body: { message: text } }); setText(''); setAsking(false); }, 'Solicitud enviada. El vendedor debe aceptarla; no se ha cobrado nada.');
  const bid = (value: number) => run(async () => { await api(`/api/market/listings/${id}/bids`, { method: 'POST', body: { amount: value, idempotencyKey: crypto.randomUUID() } }); setAmount(''); }, 'Oferta registrada. Es vinculante, pero no se ha cobrado nada.');

  const listing = detail?.listing, s = listing?.snapshot, auction = listing?.auction;
  const open = auction?.phase === 'abierta';
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="record-dialog market-detail" role="dialog" aria-modal="true" aria-label="Detalle de la publicación">
        <div className="dialog-top">
          <div><span className="eyebrow">{listing ? KIND_LABELS[listing.kind].toUpperCase() : 'PUBLICACIÓN'}</span><h2>{s ? s.title ?? s.name : 'Cargando…'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {error && !detail && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        {listing && s && detail && (
          <>
            <div className="market-detail-top">
              <PhotoGallery urls={s.photoUrls ?? (s.photoUrl ? [s.photoUrl] : [])} alt={`Fotos de ${s.title ?? s.name}`} fallback={glyphForItem(s.itemType, s.sex)} />
              <div className="market-detail-info">
                {auction ? <div className="auction-box">
                  <span className="market-meta">{auction.bidCount ? 'Oferta actual' : 'Precio inicial'}</span>
                  <span className="market-price">{money(auction.currentPrice)}</span>
                  <span className="market-meta">{auction.bidCount} {auction.bidCount === 1 ? 'oferta' : 'ofertas'}{auction.hasReserve ? ' · con precio de reserva' : ''}{auction.antiSniping ? ' · con extensión anti-francotirador' : ''}</span>
                  {listing.closesAt && <span className={`status-pill ${open ? 'pill-good' : 'pill-neutral'}`}>{auction.phase === 'programada' ? `Abre ${formatInZone(listing.opensAt!, zone)}` : open ? `Cierra ${formatInZone(listing.closesAt, zone)} · ${remaining(listing.closesAt, now)}` : 'Subasta cerrada'}</span>}
                </div> : <PriceLabel listing={listing} />}
                <dl className="market-facts">
                  <div><dt>Tipo</dt><dd>{ITEM_LABELS[s.itemType ?? 'ave']}</dd></div>
                  {s.quantity !== undefined && s.itemType && s.itemType !== 'ave' && <div><dt>Cantidad</dt><dd>{s.quantity}</dd></div>}
                  {s.species && s.itemType !== 'insumo' && <div><dt>Tipo de ave</dt><dd>{SPECIES_LABELS[speciesOf(s.species)]}</dd></div>}
                  <div><dt>{s.itemType === 'insumo' ? 'Categoría' : 'Raza'}</dt><dd>{s.breed || '—'}</dd></div>
                  {(!s.itemType || s.itemType === 'ave') && <><div><dt>Sexo</dt><dd>{sexLabel(s.sex, s.species)}</dd></div><div><dt>Nacimiento</dt><dd>{s.bornAt || 'No registrado'}</dd></div></>}
                  {s.ageLabel && <div><dt>Edad</dt><dd>{s.ageLabel}</dd></div>}
                  {s.code && <div><dt>Código</dt><dd>{s.code}</dd></div>}
                  {(!s.itemType || s.itemType === 'ave') && <div><dt>Anillo</dt><dd>{s.ring ?? 'Sin anillo'}</dd></div>}
                  {s.fertility && <div><dt>Fertilidad declarada</dt><dd>{s.fertility}</dd></div>}
                  {s.offspringCount !== undefined && <div><dt>Crías registradas</dt><dd>{s.offspringCount}</dd></div>}
                  {s.deliveryZone && <div><dt>Zona de entrega</dt><dd>{s.deliveryZone}</dd></div>}
                </dl>
                <span className="market-meta market-meta-soft"><Icon name="user" size={13} /> <Link className="seller-link" href={`/mercado/vendedor/${listing.sellerId}`}>{listing.sellerAlias}</Link>{s.breeder ? ` · Criadero ${s.breeder}` : ''}{listing.sellerReputation ? (listing.sellerReputation.count ? ` · ★ ${listing.sellerReputation.average} (${listing.sellerReputation.count} ${listing.sellerReputation.count === 1 ? 'valoración' : 'valoraciones'})` : ' · Sin valoraciones todavía') : ''}{listing.sellerReputation?.completed ? ` · ${listing.sellerReputation.completed} operaciones completadas` : ''}</span>
                {listing.publishedAt && <span className="market-meta market-meta-soft">Publicado {formatInZone(listing.publishedAt, zone, true)}</span>}
              </div>
            </div>
            {s.lotBirds && s.lotBirds.length > 0 && (
              <section><h3>Aves del lote ({s.lotBirds.length})</h3>
                <table className="lot-birds"><thead><tr><th>Nombre</th><th>Código</th><th>Sexo</th><th>Raza</th><th>Edad</th></tr></thead>
                  <tbody>{s.lotBirds.map((row, index) => <tr key={index}><td>{row.name}</td><td>{row.code || '—'}</td><td>{row.sex}</td><td>{row.breed}</td><td>{row.ageLabel}</td></tr>)}</tbody>
                </table>
              </section>
            )}
            {s.description && <section><h3>Descripción</h3><p>{s.description}</p></section>}
            {s.healthNote && <section><h3>Estado de salud declarado</h3><p>{s.healthNote}</p></section>}
            {(!s.itemType || s.itemType === 'ave') && <section><h3>Linaje declarado</h3><LineageTree name={s.name} sex={s.sex} species={s.species} breed={s.breed} code={s.code} genealogy={s.genealogy} /></section>}
            {listing.terms && <section><h3>Condiciones del vendedor</h3><p>{listing.terms}</p></section>}
            {auction && detail.bids.length > 0 && (
              <section><h3>Historial de ofertas</h3>
                <ul className="bid-history">{detail.bids.map((row, index) => <li key={index} className={row.mine ? 'bid-mine' : ''}><span>{row.alias}{row.mine ? ' (tú)' : ''}</span><strong>{money(row.amount)}</strong><small>{formatInZone(row.placedAt, zone)}</small></li>)}</ul>
              </section>
            )}
            <p className="form-hint"><Icon name="alert" size={15} /> Declarado por el vendedor. Pico Criollo no verifica raza, genealogía ni salud: pide fotos adicionales y confirma todo antes de pagar. {auction ? 'Una oferta es vinculante, pero no es un pago: la plataforma no cobra nada. ' : ''}La información de contacto solo se comparte cuando ambas partes lo acuerdan.</p>
            {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

            {detail.viewer.isOwner ? <p className="market-owner-note">Esta es tu publicación. Gestiónala en «Mis publicaciones».</p>
              : !detail.viewer.signedIn ? <div className="dialog-actions"><Link className="btn-primary" href="/">Inicia sesión para participar</Link></div>
              : <div className="market-actions">
                  {auction && open && (
                    detail.viewer.isTopBidder ? <p className="market-owner-note">Tienes la oferta más alta. Te avisaremos si alguien la supera.</p>
                    : <form className="bid-form" onSubmit={e => { e.preventDefault(); void bid(Number(amount || auction.minNextBid)); }}>
                        <label className="form-field"><span>Tu oferta (mínimo {money(auction.minNextBid)})</span><input type="number" min={auction.minNextBid} step={100} value={amount} placeholder={String(auction.minNextBid)} onChange={e => setAmount(e.target.value)} /></label>
                        <button className="btn-primary" disabled={busy} aria-busy={busy}>{busy ? 'Ofertando…' : 'Hacer una oferta'}</button>
                      </form>
                  )}
                  {listing.kind === 'fixed' && listing.status === 'publicada' && !detail.viewer.operationStatus && (
                    asking ? <div className="market-interest">
                      <label className="form-field span-two"><span>Mensaje para el vendedor (opcional)</span><textarea rows={2} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label>
                      <p className="form-hint">Solicitas comprarla por {money(listing.price)}. El vendedor debe aceptar; no se hace ningún cobro.</p>
                      <div className="dialog-actions"><button className="btn-secondary" onClick={() => setAsking(false)}>Cancelar</button><button className="btn-primary" disabled={busy} aria-busy={busy} onClick={() => void requestPurchase()}>Confirmar solicitud</button></div>
                    </div> : <div className="dialog-actions"><button className="btn-primary" onClick={() => setAsking(true)}>Solicitar compra</button></div>
                  )}
                  {detail.viewer.operationStatus && <p className="market-owner-note">Tu operación: <strong>{OPERATION_LABELS[detail.viewer.operationStatus]}</strong>. Sigue los pasos en «Mis compras».</p>}
                  {listing.status === 'publicada' && (detail.viewer.hasInterest
                    ? <div className="dialog-actions"><span className="status-pill pill-good">Ya mostraste interés</span><button className="btn-secondary" disabled={busy} aria-busy={busy} onClick={() => void interest('withdraw')}>Retirar mi interés</button></div>
                    : !asking && <div className="dialog-actions"><button className="btn-secondary" disabled={busy} aria-busy={busy} onClick={() => void interest('add')}>Me interesa</button></div>)}
                  <div className="dialog-actions market-secondary-actions"><button className="btn-secondary" onClick={() => void report()}>Denunciar publicación</button><button className="btn-secondary" onClick={() => { if (!dock) { setChat(value => !value); return; } const title = `${listing.sellerAlias} · ${s.title ?? s.name}`; if (detail.viewer.threadId) dock.openThread(detail.viewer.threadId, title); else dock.openListing(id, title); }}><Icon name="chat" size={16} />{!dock && chat ? 'Ocultar mensajes' : 'Contactar al vendedor'}</button></div>
                  {!dock && chat && <Conversation listingId={id} threadId={detail.viewer.threadId} onThread={() => void load()} />}
                </div>}
          </>
        )}
      </section>
    </div>
  );
}
