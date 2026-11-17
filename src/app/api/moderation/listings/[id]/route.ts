import { moderateListing, type ListingAction } from '@/features/market/service/moderation';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Moderación directa de una publicación (pausar, rechazar, retirar o reanudar), siempre con nota y auditoría.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  await moderateListing(deps().store,ctxFor(user.id),ctx.params.id,body.action as ListingAction,body.note);
  await flushNotifications();
  return {ok:true};
});
