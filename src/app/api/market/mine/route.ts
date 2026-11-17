import { myListings } from '@/features/market/service/listings';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  return {items:await myListings(deps().store,user.id,new URL(ctx.request.url).searchParams.get('status')??undefined)};
});
