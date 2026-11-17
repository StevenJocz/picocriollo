import { listOperations } from '@/features/market/service/operations';
import { requireUser, route } from '@/server/api';
import { deps, lazyJobs } from '@/server/context';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  await lazyJobs();
  const role=new URL(ctx.request.url).searchParams.get('role');
  return {items:await listOperations(deps().store,user.id,role==='comprador'||role==='vendedor'?role:undefined)};
});
