import type { Metadata } from 'next';
import { PublicMarket } from '@/features/market/components/public-market';
import { CommunitySessionGate } from '@/shared/components/community-session-gate';

export const metadata: Metadata = { title: 'Mercado Avícola | Pico Criollo', description: 'Mercado público de aves, huevos y lotes con trazabilidad de Pico Criollo.' };
export default function MarketPublicPage() { return <CommunitySessionGate returnTo="/mercado"><PublicMarket /></CommunitySessionGate>; }
