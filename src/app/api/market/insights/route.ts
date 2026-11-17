import { commercialInsights } from '@/features/market/service/insights';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx),q=new URL(ctx.request.url).searchParams;
  return commercialInsights(deps().store,user.id,q.get('from'),q.get('to'),new Date());
});
