import { sendMessage } from '@/features/market/service/messages';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const sent=await sendMessage(deps().store,ctxFor(user.id),{listingId:typeof body.listingId==='string'?body.listingId:undefined,threadId:typeof body.threadId==='string'?body.threadId:undefined,body:body.body});
  await flushNotifications();
  return sent;
});
