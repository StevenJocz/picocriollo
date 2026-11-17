import { createPost } from '@/features/profile/service/posts';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps } from '@/server/context';

export const runtime='nodejs';

// Crea una publicación del perfil con texto y/o archivos ya subidos (ids de /api/media).
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return createPost(deps(),ctxFor(user.id),{text:body.text,mediaIds:body.mediaIds,videoUrl:body.videoUrl});
});
