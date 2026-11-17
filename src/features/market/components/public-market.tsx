'use client';
import { MarketPage } from './market-page';
import { CommunityAccountHeader } from '@/shared/components/community-account-header';

// Catálogo de consulta para visitantes. Las acciones (interés, publicar) piden iniciar sesión.
export function PublicMarket({ initialId }: { initialId?: string }) {
  return (
    <div>
      <CommunityAccountHeader />
      <div className="market-public-body"><MarketPage initialId={initialId} /></div>
    </div>
  );
}
