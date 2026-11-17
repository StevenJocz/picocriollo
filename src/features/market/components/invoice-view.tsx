'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import type { InvoiceView as InvoiceData } from '../service/invoices';
import { api, message, money } from '../service/market-client';
import { UserLink } from './user-link';

// Factura POS interna: solo la ven el comprador y el vendedor. No es factura electrónica de venta ni documento equivalente DIAN.
export function InvoiceView({ number }: { number: string }) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null), [error, setError] = useState('');
  const zone = useTimeZone();
  useEffect(() => {
    let active = true;
    api<InvoiceData>(`/api/invoices/${encodeURIComponent(number)}`).then(value => { if (active) setInvoice(value); }).catch(e => { if (active) setError(message(e, 'No se pudo cargar la factura.')); });
    return () => { active = false; };
  }, [number]);

  return (
    <main className="receipt-page">
      <div className="receipt-tools no-print"><Link className="btn-secondary" href="/?view=facturas">Volver a Mis facturas</Link>{invoice && <button className="btn-primary" onClick={() => window.print()}>Imprimir o guardar PDF</button>}</div>
      {error ? <div className="form-error" role="alert"><Icon name="alert" size={16} />{error} Inicia sesión con la cuenta del vendedor o del comprador.</div>
        : !invoice ? <div className="loading-state"><span className="spinner" />Cargando factura…</div>
        : <article className="pos-ticket" aria-label={`Factura ${invoice.number}`}>
            <header>
              <strong>PICO CRIOLLO</strong>
              <span>Mercado Avícola</span>
              <h1>FACTURA DE VENTA POS</h1>
              <span className="pos-number">{invoice.number}</span>
            </header>
            <div className="pos-rule" />
            <dl className="pos-meta">
              <div><dt>Emitida</dt><dd>{formatInZone(invoice.issuedAt, zone, true)}</dd></div>
              <div><dt>Vendedor</dt><dd><UserLink id={invoice.sellerId} name={invoice.sellerAlias} /></dd></div>
              <div><dt>Comprador</dt><dd><UserLink id={invoice.buyerId} name={invoice.buyerAlias} /></dd></div>
            </dl>
            <div className="pos-rule" />
            {invoice.lines.map((line, index) => (
              <div key={index} className="pos-line">
                <div><strong>{line.description}</strong>{line.detail.map((detail, i) => <small key={i}>{detail}</small>)}</div>
                <span>{line.quantity} {line.unit} × {money(line.unitPrice)}</span>
                <b>{money(line.total)}</b>
              </div>
            ))}
            <div className="pos-rule" />
            <div className="pos-total"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
            <div className="pos-total"><span>Sin IVA discriminado</span><span>{money(0)}</span></div>
            <div className="pos-total pos-grand"><span>TOTAL</span><span>{money(invoice.total)}</span></div>
            <div className="pos-rule" />
            <dl className="pos-meta">
              <div><dt>Medio de pago</dt><dd>{invoice.paymentMethod || 'No indicado'}</dd></div>
              <div><dt>Pago confirmado por el vendedor</dt><dd>{formatInZone(invoice.paymentConfirmedAt, zone, true)}</dd></div>
              <div><dt>Entrega confirmada</dt><dd>{formatInZone(invoice.deliveredAt, zone, true)}</dd></div>
              <div><dt>Recepción confirmada</dt><dd>{formatInZone(invoice.receivedAt, zone, true)}</dd></div>
              <div><dt>Comprobante de transferencia</dt><dd>{invoice.receiptCode}</dd></div>
              <div><dt>Integridad</dt><dd>{invoice.integrity ? 'El contenido coincide con su huella' : 'ADVERTENCIA: el contenido no coincide con su huella'}</dd></div>
            </dl>
            <p className="pos-hash">SHA-256: {invoice.hash.slice(0, 32)}…</p>
            <p className="pos-footer">Documento interno de Pico Criollo. No es factura electrónica de venta ni documento equivalente DIAN. El pago fue confirmado por el vendedor; la plataforma no lo verifica.</p>
          </article>}
    </main>
  );
}
