import { addComment, listComments } from '@/features/profile/service/social';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Comentarios principales (con vista previa de respuestas), del más viejo al más nuevo. Requieren sesión.
export const GET=route({auth:true},async ctx=>{
  const q=new URL(ctx.request.url).searchParams,limit=Number(q.get('limit'));
  return listComments(deps().store,ctx.params.id,{after:q.get('after')??undefined,limit:Number.isFinite(limit)&&limit>0?limit:undefined},ctx.user?.id);
});

export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const comment=await addComment(deps().store,ctxFor(user.id),ctx.params.id,{text:body.text,parentId:body.parentId});
  await flushNotifications();
  return comment;
});
