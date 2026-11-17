import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError } from '../../../server/errors.ts';
import type { InvoiceLine, InvoiceRecord, ListingRecord, OperationRecord, Store, Tx, TransferReceiptRecord } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import { itemTypeOf, itemsOf } from './items.ts';
import { findBird } from './snapshot.ts';
import type { FarmJson } from './snapshot.ts';

const day = (now: Date) => now.toISOString().slice(0, 10).replace(/-/g, '');

export function invoiceNumber(now: Date): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `FAC-${day(now)}-${[...randomBytes(6)].map(byte => letters[byte % letters.length]).join('')}`;
}

/** JSON con claves ordenadas en todos los niveles: la huella no depende del orden de inserción. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const invoiceHash = (invoice: Omit<InvoiceRecord, 'id' | 'hash'>): string => createHash('sha256').update(canonical(invoice)).digest('hex');
/** Contenido firmado de una factura: todo menos `id` y `hash`. */
function contentOf(invoice: InvoiceRecord): Omit<InvoiceRecord, 'id' | 'hash'> {
  const content: Partial<InvoiceRecord> = { ...invoice };
  delete content.id; delete content.hash;
  return content as Omit<InvoiceRecord, 'id' | 'hash'>;
}
export const verifyInvoice = (invoice: InvoiceRecord): boolean => invoiceHash(contentOf(invoice)) === invoice.hash;

function lineOf(listing: ListingRecord, sellerData: FarmJson, price: number): InvoiceLine {
  const type = itemTypeOf(listing), items = itemsOf(listing);
  const description = listing.snapshot.title ?? listing.snapshot.name;
  let detail: string[] = [];
  if (type === 'ave' || type === 'lote_aves') {
    detail = items.flatMap(item => {
      if (item.type !== 'ave') return [];
      const bird = findBird(sellerData, item.birdId);
      return bird ? [`${bird.name} · ${bird.code ?? 'sin código'}`] : [];
    });
  } else {
    detail = type === 'insumo'
      ? [listing.snapshot.title ?? listing.snapshot.name]
      : [`${listing.snapshot.quantity ?? 0} ${type === 'lote_pollitos' ? 'pollitos' : 'huevos'} ${listing.snapshot.breed}`.trim()];
  }
  return { description, detail, itemType: type, unit: type === 'ave' ? 'ave' : 'lote', quantity: 1, unitPrice: price, total: price };
}

/** Se llama dentro de la transacción de la transferencia: la factura existe si y solo si la venta se completó. */
export async function issueInvoice(tx: Tx, op: OperationRecord, listing: ListingRecord, receipt: TransferReceiptRecord, now: Date, sellerData: FarmJson): Promise<InvoiceRecord> {
  const issuedAt = now.toISOString();
  const content: Omit<InvoiceRecord, 'id' | 'hash'> = {
    number: invoiceNumber(now), operationId: op.id, listingId: listing.id, receiptCode: receipt.code,
    sellerId: op.sellerId, buyerId: op.buyerId, sellerAlias: receipt.sellerAlias, buyerAlias: receipt.buyerAlias,
    lines: [lineOf(listing, sellerData, op.price)], subtotal: op.price, total: op.price, currency: 'COP',
    ...(op.paymentMethod ? { paymentMethod: op.paymentMethod } : {}), ...(op.paymentDeclaredAt ? { paymentDeclaredAt: op.paymentDeclaredAt } : {}),
    paymentConfirmedAt: op.paymentConfirmedAt!, deliveredAt: op.sellerDeliveredAt!, receivedAt: op.buyerReceivedAt ?? issuedAt, issuedAt,
  };
  const invoice: InvoiceRecord = { id: randomUUID(), ...content, hash: invoiceHash(content) };
  await tx.invoices.insert(invoice);
  await emit(tx, { type: 'market.invoice.issued', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, invoiceId: invoice.id }, dedupeKey: `invoice-issued:${op.id}`, now });
  return invoice;
}

export interface InvoiceSummary { counterpartId: string; number: string; issuedAt: string; title: string; total: number; role: 'comprador' | 'vendedor'; counterpart: string; operationId: string; }
export type InvoiceView = Omit<InvoiceRecord, 'id'> & { role: 'comprador' | 'vendedor'; integrity: boolean };

export async function listInvoices(store: Store, userId: string, role?: 'comprador' | 'vendedor'): Promise<InvoiceSummary[]> {
  return store.tx(async tx => {
    const rows = [...(role !== 'vendedor' ? await tx.invoices.list({ buyerId: userId }) : []), ...(role !== 'comprador' ? await tx.invoices.list({ sellerId: userId }) : [])];
    return rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map(row => ({
      number: row.number, issuedAt: row.issuedAt, title: row.lines[0]?.description ?? 'Venta', total: row.total, operationId: row.operationId,
      counterpartId: row.buyerId === userId ? row.sellerId : row.buyerId, role: row.buyerId === userId ? 'comprador' as const : 'vendedor' as const, counterpart: row.buyerId === userId ? row.sellerAlias : row.buyerAlias,
    }));
  });
}

export async function getInvoice(store: Store, userId: string, number: string): Promise<InvoiceView> {
  return store.tx(async tx => {
    const invoice = (await tx.invoices.list({ number }))[0];
    if (!invoice) throw new NotFoundError('Factura no encontrada.');
    if (invoice.buyerId !== userId && invoice.sellerId !== userId) throw new ForbiddenError('Esta factura no es tuya.');
    const view: Partial<InvoiceRecord> = { ...invoice };
    delete view.id;
    return { ...(view as Omit<InvoiceRecord, 'id'>), role: invoice.buyerId === userId ? 'comprador' : 'vendedor', integrity: verifyInvoice(invoice) };
  });
}
