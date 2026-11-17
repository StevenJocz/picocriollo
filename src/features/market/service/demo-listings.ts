import { DEMO_USER_IDS } from '../../../server/demo-ids.ts';

export interface DemoMarketListing {
  id: string;
  sellerId: string;
  sellerAlias: string;
  title: string;
  itemType: string;
  breed: string;
  imageUrl: string;
  examplePrice: string;
  description: string;
}

/** Muestras visuales; no son inventario ni publicaciones operables del mercado. */
export const DEMO_MARKET_LISTINGS: DemoMarketListing[] = [
  {
    id: 'demo-market-gallina', sellerId: DEMO_USER_IDS.roble, sellerAlias: 'Muestra · Finca El Roble',
    title: 'Gallina criolla · ficha de ejemplo', itemType: 'Ave individual', breed: 'Criolla',
    imageUrl: '/fotos/ave-gallina.jpg', examplePrice: 'Ejemplo: $85.000 COP',
    description: 'Así se presenta un ave en el mercado. Foto y datos ilustrativos; no está disponible para compra.',
  },
  {
    id: 'demo-market-pollitos', sellerId: DEMO_USER_IDS.semilla, sellerAlias: 'Muestra · Criadero La Semilla',
    title: 'Lote de pollitos · ficha de ejemplo', itemType: 'Lote de pollitos', breed: 'Cruce criollo',
    imageUrl: '/fotos/ave-pollito.jpg', examplePrice: 'Ejemplo: consultar',
    description: 'Ejemplo de publicación de un lote. No representa existencias ni una oferta real.',
  },
];

