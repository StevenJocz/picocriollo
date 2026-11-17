import { rateOperation } from '@/features/market/service/trust';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Una valoración por parte y operación completada, dentro de 14 días.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const rating=await rateOperation(deps().store,ctxFor(user.id),ctx.params.id,{stars:body.stars,comment:body.comment});
  await flushNotifications();
  return {id:rating.id,stars:rating.stars};
});
