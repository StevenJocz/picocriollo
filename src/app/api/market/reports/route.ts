import { createReport } from '@/features/market/service/moderation';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Denunciar publicaciones engañosas, usuarios o mensajes abusivos.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const report=await createReport(deps().store,ctxFor(user.id),{targetType:body.targetType,targetId:body.targetId,reason:body.reason});
  await flushNotifications();
  return {id:report.id,status:report.status};
});
