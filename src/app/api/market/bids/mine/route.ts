import { myBids } from '@/features/market/service/auction';
import { requireUser, route } from '@/server/api';
import { deps, lazyJobs } from '@/server/context';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  await lazyJobs();
  return {items:await myBids(deps().store,user.id,new Date())};
});
