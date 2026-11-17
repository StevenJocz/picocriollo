import type { Metadata } from 'next';
import { TransferReceiptView } from '@/features/market/components/transfer-receipt';

export const metadata: Metadata = { title: 'Comprobante de transferencia | Pico Criollo', robots: { index: false } };
export default async function TransferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TransferReceiptView code={code} />;
}
