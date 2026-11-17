'use client';
import { Icon } from '@/shared/components/icon';
import { OperationsList } from './operations-list';

export function PurchasesPage({ onNotice }: { onNotice: (text: string) => void }) {
  return (
    <div className="module-view market-view">
      <div className="module-title-row">
        <div>
          <div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mis compras</strong></div>
          <h1>Mis compras</h1>
          <p>Solicitudes, subastas ganadas y compras en curso. El pago y la entrega los acuerdas con el vendedor.</p>
        </div>
      </div>
      <OperationsList role="comprador" onNotice={onNotice} emptyText="Cuando solicites una compra o ganes una subasta aparecerá aquí." />
    </div>
  );
}
