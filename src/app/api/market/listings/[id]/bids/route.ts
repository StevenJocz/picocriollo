import { placeBid } from '@/features/market/service/auction';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// La oferta es vinculante pero no es un pago: la plataforma no cobra nada.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const bid=await placeBid(deps().store,ctxFor(user.id),ctx.params.id,body.amount,body.idempotencyKey);
  await flushNotifications();
  return {id:bid.id,amount:bid.amount,status:bid.status};
});
