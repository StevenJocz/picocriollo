import { resolveDispute } from '@/features/market/service/moderation';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

export const PATCH=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  await resolveDispute(deps().store,ctxFor(user.id),ctx.params.id,{decision:body.decision,note:body.note});
  await flushNotifications();
  return {ok:true};
});
