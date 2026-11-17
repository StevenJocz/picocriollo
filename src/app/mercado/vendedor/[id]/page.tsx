import type { Metadata } from 'next';
import { SellerProfileView } from '@/features/market/components/seller-profile';
import { CommunitySessionGate } from '@/shared/components/community-session-gate';

export const metadata: Metadata = { title: 'Perfil del criador | Pico Criollo', description: 'Reputación, publicaciones y opiniones de un criador de Pico Criollo.' };
export default async function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommunitySessionGate returnTo={`/mercado/vendedor/${encodeURIComponent(id)}`}><SellerProfileView id={id} /></CommunitySessionGate>;
}
