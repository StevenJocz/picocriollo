import { getPreferences, updatePreferences } from '@/features/notifications/service/preferences';
import { readBody, requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  return {preferences:await deps().store.tx(tx=>getPreferences(tx,user.id))};
});

export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return {preferences:await deps().store.tx(tx=>updatePreferences(tx,user.id,body,new Date()))};
});
