import type { Metadata } from 'next';
import { PublicMarket } from '@/features/market/components/public-market';
import { CommunitySessionGate } from '@/shared/components/community-session-gate';

export const metadata: Metadata = { title: 'Publicación | Mercado Avícola', description: 'Detalle de un ave publicada en Pico Criollo.' };
export default async function ListingPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommunitySessionGate returnTo={`/mercado/${encodeURIComponent(id)}`}><PublicMarket initialId={id} /></CommunitySessionGate>;
}
