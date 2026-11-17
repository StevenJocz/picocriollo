import { deletePost, editPost, getPost } from '@/features/profile/service/posts';
import { readBody, requireUser, route } from '@/server/api';
import { isSameOrigin } from '@/server/auth';
import { ctxFor, deps } from '@/server/context';
import { HttpError } from '@/server/errors';

export const runtime='nodejs';

// Una publicación (los enlaces de las notificaciones llevan aquí). Pública; las ocultas por moderación solo las ve su autor.
export const GET=route({auth:true},async ctx=>getPost(deps().store,ctx.params.id,ctx.user?.id));

export const PATCH=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return editPost(deps(),ctxFor(user.id),ctx.params.id,body.text);
});

// DELETE no lleva cuerpo JSON: el envoltorio `mutating` lo rechazaría, así que el origen se valida aquí.
export const DELETE=route({auth:true},async ctx=>{
  if(!isSameOrigin(ctx.request))throw new HttpError(403,'Origen de solicitud no permitido.');
  await deletePost(deps(),ctxFor(requireUser(ctx).id),ctx.params.id);
  return {ok:true};
});
