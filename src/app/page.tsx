import type { Metadata } from 'next';
import { PublicReels } from '@/features/profile/components/public-reels';
import { CommunitySessionGate } from '@/shared/components/community-session-gate';

export const metadata: Metadata = {
  title: 'Inicio | Pico Criollo',
  description: 'Reels públicos de la comunidad avícola de Pico Criollo.',
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tag?: string; q?: string }> }) {
  const { tag, q } = await searchParams;
  const returnTo = tag ? `/?tag=${encodeURIComponent(tag)}` : '/';
  return <CommunitySessionGate returnTo={returnTo}><PublicReels key={tag ?? ''} initialTag={tag} initialQuery={q} /></CommunitySessionGate>;
}
