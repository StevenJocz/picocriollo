import { sharePost } from '@/features/profile/service/posts';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';

export const runtime='nodejs';

// Comparte en el perfil de quien llama el reel de otra persona (con un comentario opcional).
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const post=await sharePost(deps(),ctxFor(user.id),ctx.params.id,body.comment);
  await flushNotifications();
  return post;
});
