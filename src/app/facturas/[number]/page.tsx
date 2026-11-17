import type { Metadata } from 'next';
import { InvoiceView } from '@/features/market/components/invoice-view';

export const metadata: Metadata = { title: 'Factura | Pico Criollo', robots: { index: false } };
export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <InvoiceView number={number} />;
}
