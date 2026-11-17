import { requestPurchase } from '@/features/market/service/operations';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Solicitar compra no vende nada: crea una solicitud que el vendedor debe aceptar o rechazar.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const op=await requestPurchase(deps().store,ctxFor(user.id),ctx.params.id,body.message);
  await flushNotifications();
  return {id:op.id,status:op.status};
});
