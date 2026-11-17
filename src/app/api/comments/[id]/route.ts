import { deleteComment, editComment } from '@/features/profile/service/social';
import { readBody, requireUser, route } from '@/server/api';
import { isSameOrigin } from '@/server/auth';
import { ctxFor, deps } from '@/server/context';
import { HttpError } from '@/server/errors';

export const runtime='nodejs';

export const PATCH=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return editComment(deps().store,ctxFor(user.id),ctx.params.id,body.text);
});

// DELETE sin cuerpo JSON: el origen se valida aquí.
export const DELETE=route({auth:true},async ctx=>{
  if(!isSameOrigin(ctx.request))throw new HttpError(403,'Origen de solicitud no permitido.');
  await deleteComment(deps().store,ctxFor(requireUser(ctx).id),ctx.params.id);
  return {ok:true};
});
