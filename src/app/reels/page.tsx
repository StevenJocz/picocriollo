import type { Metadata } from 'next';
import { PublicReels } from '@/features/profile/components/public-reels';
import { CommunitySessionGate } from '@/shared/components/community-session-gate';

export const metadata: Metadata = {
  title: 'Reels públicos | Pico Criollo',
  description: 'Fotos y videos públicos de la comunidad de criadores de Pico Criollo.',
};

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const tag = (await searchParams).tag;
  const returnTo = tag ? `/reels?tag=${encodeURIComponent(tag)}` : '/reels';
  return <CommunitySessionGate returnTo={returnTo}><PublicReels key={tag ?? ''} initialTag={tag} /></CommunitySessionGate>;
}
