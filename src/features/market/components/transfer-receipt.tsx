'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { api, message, money } from '../service/market-client';
import { UserLink } from './user-link';

interface Receipt { sellerId?: string; buyerId?: string; code: string; birdName: string; birdCode: string; ring: number | null; sellerAlias: string; buyerAlias: string; price: number; transferredAt: string; hash: string; integrity: boolean; role: string; }

// Comprobante interno de transferencia: solo lo ven vendedor y comprador. No es un título legal ni una factura electrónica.
export function TransferReceiptView({ code }: { code: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null), [error, setError] = useState('');
  const zone = useTimeZone();
  useEffect(() => {
    let active = true;
    api<Receipt>(`/api/transfers/${encodeURIComponent(code)}`).then(value => { if (active) setReceipt(value); }).catch(e => { if (active) setError(message(e, 'No se pudo cargar el comprobante.')); });
    return () => { active = false; };
  }, [code]);

  return (
    <main className="receipt-page">
      <div className="receipt-tools"><Link className="btn-secondary" href="/">Volver a Pico Criollo</Link>{receipt && <button className="btn-primary" onClick={() => window.print()}>Imprimir o guardar PDF</button>}</div>
      {error ? <div className="form-error" role="alert"><Icon name="alert" size={16} />{error} Inicia sesión con la cuenta del vendedor o del comprador.</div>
        : !receipt ? <div className="loading-state"><span className="spinner" />Cargando comprobante…</div>
        : <article className="receipt-sheet">
            <header><span className="eyebrow">COMPROBANTE DE TRANSFERENCIA DE PROPIEDAD</span><h1>{receipt.code}</h1></header>
            <dl className="market-facts">
              <div><dt>Ave</dt><dd>{receipt.birdName}</dd></div>
              <div><dt>Código permanente</dt><dd>{receipt.birdCode || '—'}</dd></div>
              <div><dt>Anillo</dt><dd>{receipt.ring ?? 'Sin anillo'}</dd></div>
              <div><dt>Valor acordado</dt><dd>{money(receipt.price)}</dd></div>
              <div><dt>Vendedor</dt><dd><UserLink id={receipt.sellerId} name={receipt.sellerAlias} /></dd></div>
              <div><dt>Comprador</dt><dd><UserLink id={receipt.buyerId} name={receipt.buyerAlias} /></dd></div>
              <div><dt>Fecha de transferencia</dt><dd>{formatInZone(receipt.transferredAt, zone, true)}</dd></div>
              <div><dt>Integridad</dt><dd>{receipt.integrity ? 'El contenido coincide con su huella' : 'ADVERTENCIA: el contenido no coincide con su huella'}</dd></div>
            </dl>
            <p className="receipt-hash">Huella SHA-256: {receipt.hash}</p>
            <p className="form-hint"><Icon name="alert" size={15} /> Documento interno de Pico Criollo que registra el cambio de propietario dentro de la plataforma. La huella detecta alteraciones del contenido; no es un título legal, una factura electrónica ni una verificación del pago, la raza, la genealogía o la salud del ave.</p>
          </article>}
    </main>
  );
}
