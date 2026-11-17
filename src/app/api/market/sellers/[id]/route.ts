import { getSellerProfile } from '@/features/market/service/seller-profile';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
const offset=(value:string|null)=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:0};

// Perfil comunitario: usuarios autenticados solo reciben la proyección aprobada.
export const GET=route({auth:true},async ctx=>getSellerProfile(deps().store,ctx.params.id,new Date(),{reviewsOffset:offset(new URL(ctx.request.url).searchParams.get('reviewsOffset')),viewerId:ctx.user?.id}));
