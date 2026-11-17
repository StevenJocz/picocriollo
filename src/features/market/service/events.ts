import type { ListingRecord, OperationRecord, Tx } from '../../../server/storage/types.ts';
import type { EventDef, EventRegistry } from '../../notifications/service/events.ts';
import { getPreferences } from '../../notifications/service/preferences.ts';
import { staffIds } from '../../../server/guards.ts';
import { aliasOf } from './snapshot.ts';

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
export const cop = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

/** Fecha y hora en la zona horaria configurada por el destinatario (por defecto America/Bogota). */
async function localTime(tx: Tx, userId: string, iso: string): Promise<string> {
  const prefs = await getPreferences(tx, userId);
  return new Intl.DateTimeFormat('es-CO', { timeZone: prefs.timeZone, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

const listingOf = (tx: Tx, id: unknown) => tx.listings.get(String(id));
const opOf = (tx: Tx, id: unknown) => tx.operations.get(String(id));
const nameOf = (listing: ListingRecord | undefined, fallback = 'tu ave') => listing?.snapshot.name ?? fallback;
const aliasById = async (tx: Tx, id: string | undefined) => { const user = id ? await tx.users.get(id) : undefined; return user ? aliasOf(user) : 'Un usuario'; };

const toSeller = (key: string): EventDef['recipients'] => async (tx, event) => { const l = await listingOf(tx, event.payload[key]); return l ? [l.sellerId] : []; };
const fromOp = async (tx: Tx, event: { payload: Record<string, unknown> }): Promise<OperationRecord | undefined> => opOf(tx, event.payload.operationId);

// Definiciones de eventos del mercado. Las plantillas solo usan datos que el destinatario puede ver.
export const marketEvents: EventRegistry = {
  'market.listing.published': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Publicación creada', body: `«${nameOf(await listingOf(tx, event.payload.listingId), 'Tu ave')}» ya está visible en el Mercado Avícola.`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'market.listing.needs_review': {
    category: 'comercial', priority: 'alta', critical: false,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Revisa tu publicación', body: `Cambiaste la ficha de «${nameOf(await listingOf(tx, event.payload.listingId))}». La publicación mantiene los datos anteriores hasta que la actualices.`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'market.interest.created': {
    category: 'comercial', priority: 'normal', critical: false, preference: 'interests',
    recipients: toSeller('listingId'),
    render: async (tx, event) => {
      const interest = await tx.interests.get(String(event.payload.interestId));
      const message = interest?.message ? `: «${clip(interest.message)}»` : '.';
      return { title: `Nuevo interesado en «${nameOf(await listingOf(tx, event.payload.listingId))}»`, body: `${await aliasById(tx, interest?.userId)} mostró interés${message}`, link: { view: 'publicaciones', id: event.aggregateId } };
    },
  },
  'market.bid.received': {
    category: 'comercial', priority: 'normal', critical: false, preference: 'offers',
    recipients: toSeller('listingId'),
    render: async (tx, event) => {
      const bid = await tx.bids.get(String(event.payload.bidId));
      return { title: `Nueva oferta en «${nameOf(await listingOf(tx, event.payload.listingId))}»`, body: `Un postor ofreció ${cop(bid?.amount ?? 0)}. Es una oferta vinculante, no un pago.`, link: { view: 'publicaciones', id: event.aggregateId } };
    },
  },
  'market.bid.outbid': {
    category: 'comercial', priority: 'alta', critical: false, preference: 'offers',
    recipients: async (tx, event) => { const previous = await tx.bids.get(String(event.payload.previousBidId)); return previous ? [previous.bidderId] : []; },
    render: async (tx, event) => {
      const bid = await tx.bids.get(String(event.payload.bidId));
      return { title: `Superaron tu oferta en «${nameOf(await listingOf(tx, event.payload.listingId), 'la subasta')}»`, body: `La oferta más alta ahora es de ${cop(bid?.amount ?? 0)}. Puedes ofertar de nuevo hasta el cierre.`, link: { view: 'ofertas', id: event.aggregateId } };
    },
  },
  'market.auction.closing_soon': {
    category: 'comercial', priority: 'alta', critical: false, preference: 'offers',
    recipients: async (tx, event) => {
      const listing = await listingOf(tx, event.payload.listingId);
      if (!listing) return [];
      const bidders = (await tx.bids.list({ listingId: listing.id })).filter(bid => bid.status === 'valida' || bid.status === 'superada').map(bid => bid.bidderId);
      return [listing.sellerId, ...bidders];
    },
    render: async (tx, event, recipientId) => {
      const listing = await listingOf(tx, event.payload.listingId);
      const when = await localTime(tx, recipientId, String(event.payload.closesAt));
      const isSeller = listing?.sellerId === recipientId;
      return { title: 'Subasta próxima a cerrar', body: `«${nameOf(listing, 'La subasta')}» cierra el ${when}.`, link: { view: isSeller ? 'publicaciones' : 'ofertas', id: event.aggregateId } };
    },
  },
  'market.auction.won': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: `Ganaste la subasta de «${nameOf(await listingOf(tx, event.payload.listingId), 'un ave')}»`, body: `Tu oferta de ${cop(op?.price ?? 0)} fue la más alta. Coordina el pago y la entrega con el vendedor.`, link: { view: 'compras-mercado', id: event.aggregateId } };
    },
  },
  'market.auction.ended': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: toSeller('listingId'),
    render: async (tx, event) => {
      const name = nameOf(await listingOf(tx, event.payload.listingId));
      const outcome = String(event.payload.outcome);
      const body = outcome === 'sold' ? `La subasta de «${name}» terminó con una oferta ganadora de ${cop(Number(event.payload.amount))}. Gestiona la operación con el comprador.`
        : outcome === 'reserve_not_met' ? `La subasta de «${name}» terminó sin alcanzar el precio de reserva. El ave quedó libre y puedes volver a publicarla.`
        : `La subasta de «${name}» terminó sin ofertas válidas. Puedes volver a publicarla.`;
      return { title: outcome === 'sold' ? 'Tu subasta terminó con comprador' : 'Tu subasta terminó sin comprador', body, link: { view: 'publicaciones', id: event.aggregateId } };
    },
  },
  'market.auction.lost': {
    category: 'comercial', priority: 'baja', critical: false, preference: 'offers',
    recipients: async (_tx, event) => (Array.isArray(event.payload.bidderIds) ? (event.payload.bidderIds as string[]) : []),
    render: async (tx, event) => ({ title: 'La subasta terminó', body: `No ganaste la subasta de «${nameOf(await listingOf(tx, event.payload.listingId), 'un ave')}»${event.payload.reserveNotMet ? ': no se alcanzó el precio de reserva' : ''}. No se realizó ningún cobro.`, link: { view: 'ofertas', id: event.aggregateId } }),
  },
  'market.auction.cancelled': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: async (_tx, event) => (Array.isArray(event.payload.bidderIds) ? (event.payload.bidderIds as string[]) : []),
    render: async (tx, event) => ({ title: 'Subasta cancelada por el vendedor', body: `La subasta de «${nameOf(await listingOf(tx, event.payload.listingId), 'un ave')}» fue cancelada. Motivo: ${clip(String(event.payload.reason || 'no indicado'))}. Tus ofertas quedaron sin efecto.`, link: { view: 'ofertas', id: event.aggregateId } }),
  },
  'market.purchase.requested': {
    category: 'comercial', priority: 'alta', critical: false, preference: 'offers',
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.sellerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      const listing = await listingOf(tx, op?.listingId);
      return { title: `Solicitud de compra por «${nameOf(listing)}»`, body: `${await aliasById(tx, op?.buyerId)} quiere comprarla por ${cop(op?.price ?? 0)}. Acéptala o recházala; no se completa hasta que lo decidas.`, link: { view: 'publicaciones', id: op?.listingId } };
    },
  },
  'market.purchase.accepted': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: 'El vendedor aceptó tu solicitud', body: `«${nameOf(await listingOf(tx, op?.listingId), 'El ave')}» quedó reservada para ti por ${cop(op?.price ?? 0)}. Sigue con el pago y la entrega.`, link: { view: 'compras-mercado', id: op?.id } };
    },
  },
  'market.purchase.rejected': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: 'Tu solicitud de compra no prosperó', body: `${op?.cancelReason ?? 'El vendedor no aceptó la solicitud'} («${nameOf(await listingOf(tx, op?.listingId), 'el ave')}»).`, link: { view: 'compras-mercado', id: op?.id } };
    },
  },
  'market.operation.payment_declared': {
    category: 'transferencia', priority: 'alta', critical: false,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.sellerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: 'El comprador declaró el pago', body: `${await aliasById(tx, op?.buyerId)} indicó que pagó ${cop(op?.price ?? 0)} por «${nameOf(await listingOf(tx, op?.listingId))}» (${op?.paymentMethod ?? 'medio no indicado'}). Confírmalo solo cuando lo hayas recibido: Pico Criollo no verifica pagos.`, link: { view: 'publicaciones', id: op?.listingId } };
    },
  },
  'market.operation.payment_confirmed': {
    category: 'transferencia', priority: 'alta', critical: false,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: 'El vendedor confirmó tu pago', body: `Pago de «${nameOf(await listingOf(tx, op?.listingId), 'el ave')}» confirmado por el vendedor. La entrega está pendiente.`, link: { view: 'compras-mercado', id: op?.id } };
    },
  },
  'market.operation.delivered': {
    category: 'transferencia', priority: 'alta', critical: false,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId] : []; },
    render: async (tx, event) => {
      const op = await fromOp(tx, event);
      return { title: 'El vendedor confirmó la entrega', body: `Confirma la recepción de «${nameOf(await listingOf(tx, op?.listingId), 'el ave')}» cuando la tengas contigo. Al confirmar, la propiedad pasa a tu cuenta.`, link: { view: 'compras-mercado', id: op?.id } };
    },
  },
  'market.operation.cancelled': {
    category: 'transferencia', priority: 'alta', critical: true,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId, op.sellerId].filter(id => id !== event.payload.byId) : []; },
    render: async (tx, event, recipientId) => {
      const op = await fromOp(tx, event);
      return { title: 'Una operación fue cancelada', body: `${await aliasById(tx, String(event.payload.byId))} canceló la operación de «${nameOf(await listingOf(tx, op?.listingId), 'un ave')}». Motivo: ${clip(op?.cancelReason ?? 'no indicado')}`, link: { view: op?.buyerId === recipientId ? 'compras-mercado' : 'publicaciones', id: op?.id } };
    },
  },
  'market.operation.disputed': {
    category: 'transferencia', priority: 'critica', critical: true,
    recipients: async (tx, event) => {
      const op = await fromOp(tx, event);
      if (!op) return [];
      const staff = [...(await tx.users.list({ role: 'moderator' })), ...(await tx.users.list({ role: 'admin' }))].map(user => user.id);
      return [op.buyerId, op.sellerId, ...staff].filter(id => id !== event.payload.byId);
    },
    render: async (tx, event, recipientId) => {
      const op = await fromOp(tx, event);
      const party = op?.buyerId === recipientId || op?.sellerId === recipientId;
      return { title: party ? 'Se abrió una disputa en tu operación' : 'Disputa por revisar', body: `${await aliasById(tx, String(event.payload.byId))} abrió una disputa por «${nameOf(await listingOf(tx, op?.listingId), 'un ave')}»: ${clip(op?.disputeReason ?? '')}. El ave sigue reservada hasta que se resuelva.`, link: { view: party ? (op?.buyerId === recipientId ? 'compras-mercado' : 'publicaciones') : 'moderacion', id: op?.id } };
    },
  },
  'market.transfer.completed': {
    category: 'transferencia', priority: 'alta', critical: true,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.sellerId, op.buyerId] : []; },
    render: async (tx, event, recipientId) => {
      const op = await fromOp(tx, event);
      const listing = await listingOf(tx, op?.listingId);
      const code = String(event.payload.receiptCode);
      return op?.sellerId === recipientId
        ? { title: 'Venta completada y propiedad transferida', body: `«${nameOf(listing, 'El ave')}» ya pertenece a ${await aliasById(tx, op?.buyerId)}. Comprobante ${code}.`, link: { view: 'publicaciones', id: op?.listingId } }
        : { title: 'El ave ya es tuya', body: `La propiedad de «${nameOf(listing, 'el ave')}» se transfirió a tu cuenta. Revisa «Mis aves» y asígnale un gallinero. Comprobante ${code}.`, link: { view: 'aves' } };
    },
  },
  'market.invoice.issued': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: async (tx, event) => { const invoice = await tx.invoices.get(String(event.payload.invoiceId)); return invoice ? [invoice.sellerId, invoice.buyerId] : []; },
    render: async (tx, event) => {
      const invoice = await tx.invoices.get(String(event.payload.invoiceId));
      return { title: `Factura ${invoice?.number ?? ''}`.trim(), body: `Se emitió la factura por ${cop(invoice?.total ?? 0)} de «${invoice?.lines[0]?.description ?? 'tu venta'}». Puedes verla e imprimirla desde Mis facturas.`, link: { view: 'facturas', id: invoice?.number } };
    },
  },
  'market.rating.received': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: async (tx, event) => { const rating = await tx.ratings.get(String(event.payload.ratingId)); return rating ? [rating.rateeId] : []; },
    render: async (tx, event) => {
      const rating = await tx.ratings.get(String(event.payload.ratingId));
      const op = await opOf(tx, event.payload.operationId);
      return { title: 'Recibiste una valoración', body: `${await aliasById(tx, rating?.raterId)} valoró tu operación de «${nameOf(await listingOf(tx, op?.listingId), 'un ave')}» con ${rating?.stars ?? 0} de 5.`, link: { view: 'compras-mercado', id: op?.id } };
    },
  },
  'moderation.report.created': {
    category: 'sistema', priority: 'normal', critical: false,
    recipients: async (tx, event) => (await staffIds(tx)).filter(id => id !== event.payload.reporterId),
    render: async (tx, event) => {
      const report = await tx.reports.get(String(event.payload.reportId));
      const kind = report?.targetType === 'listing' ? 'una publicación' : report?.targetType === 'user' ? 'un usuario' : report?.targetType === 'post' ? 'una publicación del perfil' : report?.targetType === 'comment' ? 'un comentario' : 'un mensaje';
      return { title: 'Nueva denuncia por revisar', body: `Se denunció ${kind}: ${clip(report?.reason ?? '')}`, link: { view: 'moderacion', id: report?.id } };
    },
  },
  'moderation.listing.paused': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Tu publicación fue pausada por moderación', body: `«${nameOf(await listingOf(tx, event.payload.listingId))}» está en revisión y no es visible. ${clip(String(event.payload.note ?? ''))}`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'moderation.listing.rejected': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Tu publicación fue rechazada por moderación', body: `«${nameOf(await listingOf(tx, event.payload.listingId))}» incumple las reglas. Motivo: ${clip(String(event.payload.note ?? ''))}`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'moderation.listing.withdrawn': {
    category: 'comercial', priority: 'alta', critical: true,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Tu publicación fue retirada por moderación', body: `«${nameOf(await listingOf(tx, event.payload.listingId))}» fue retirada del mercado. Motivo: ${clip(String(event.payload.note ?? ''))}`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'moderation.listing.restored': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: toSeller('listingId'),
    render: async (tx, event) => ({ title: 'Tu publicación fue aprobada de nuevo', body: `«${nameOf(await listingOf(tx, event.payload.listingId))}» volvió a estar visible en el mercado.`, link: { view: 'publicaciones', id: event.aggregateId } }),
  },
  'moderation.account.warned': {
    category: 'seguridad', priority: 'alta', critical: true,
    recipients: async (_tx, event) => [String(event.payload.userId)],
    render: async (_tx, event) => ({ title: 'Advertencia de moderación', body: `Un moderador revisó una denuncia sobre tu cuenta: ${clip(String(event.payload.note ?? ''))} Revisa las reglas del mercado.`, link: { view: 'perfil' } }),
  },
  'moderation.account.suspended': {
    category: 'seguridad', priority: 'critica', critical: true,
    recipients: async (_tx, event) => [String(event.payload.userId)],
    render: async (_tx, event) => ({ title: 'Tu cuenta tiene restricciones comerciales', body: `No podrás publicar, ofertar ni escribir en el mercado hasta que un moderador lo revise. Motivo: ${clip(String(event.payload.note ?? ''))}`, link: { view: 'perfil' } }),
  },
  'moderation.account.restored': {
    category: 'seguridad', priority: 'alta', critical: true,
    recipients: async (_tx, event) => [String(event.payload.userId)],
    render: async () => ({ title: 'Restricciones levantadas', body: 'Ya puedes volver a usar el mercado con normalidad.', link: { view: 'mercado' } }),
  },
  'moderation.dispute.resolved': {
    category: 'transferencia', priority: 'alta', critical: true,
    recipients: async (tx, event) => { const op = await fromOp(tx, event); return op ? [op.buyerId, op.sellerId] : []; },
    render: async (tx, event, recipientId) => {
      const op = await fromOp(tx, event);
      const cancelled = event.payload.decision === 'cancel';
      return { title: 'Se resolvió la disputa', body: `${cancelled ? 'La operación fue cancelada y el ave quedó liberada.' : 'La operación se reanuda donde estaba.'} Nota del moderador: ${clip(String(event.payload.note ?? ''))}`, link: { view: op?.buyerId === recipientId ? 'compras-mercado' : 'publicaciones', id: op?.id } };
    },
  },
  'market.message.created': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: async (_tx, event) => [String(event.payload.recipientId)],
    render: async (tx, event) => {
      const message = await tx.messages.get(String(event.payload.messageId));
      const listing = await listingOf(tx, event.payload.listingId);
      return { title: `Mensaje nuevo sobre «${nameOf(listing, 'una publicación')}»`, body: `${await aliasById(tx, message?.senderId)}: ${clip(message?.body ?? '')}`, link: { view: 'mensajes', id: String(event.payload.threadId) } };
    },
  },
};
