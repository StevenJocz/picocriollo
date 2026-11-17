'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import type { OperationView } from '../service/operations';
import { api, message } from '../service/market-client';
import { OperationCard } from './operation-card';

// Operaciones del usuario como comprador o vendedor. Cada acción se valida de nuevo en el servidor.
export function OperationsList({ role, onNotice, onChanged, emptyText }: { role: 'comprador' | 'vendedor'; onNotice: (text: string) => void; onChanged?: () => void; emptyText: string }) {
  const [items, setItems] = useState<OperationView[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: OperationView[] }>(`/api/market/operations?role=${role}`)).items); setError(''); }
    catch (e) { setError(message(e, 'No se pudieron cargar las operaciones.')); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); const poll = window.setInterval(() => void load(), 30_000); return () => { window.clearTimeout(timer); window.clearInterval(poll); }; }, [load]);

  async function act(op: OperationView, action: string, extra?: Record<string, string>) {
    setBusy(true);
    try {
      await api(`/api/market/operations/${op.id}`, { method: 'PATCH', body: { action, ...extra } });
      onNotice('Listo: la operación se actualizó.');
      await load(); onChanged?.();
    } finally { setBusy(false); }
  }

  if (loading) return <div className="loading-state"><span className="spinner" />Cargando…</div>;
  return (
    <div className="market-list">
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {items.length === 0 && !error ? <div className="empty-state"><div className="empty-icon"><Icon name="swap" size={26} /></div><h3>Sin operaciones</h3><p>{emptyText}</p></div>
        : items.map(op => <OperationCard key={op.id} op={op} busy={busy} onAction={act} />)}
    </div>
  );
}
