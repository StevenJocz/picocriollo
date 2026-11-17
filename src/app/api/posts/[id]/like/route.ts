import { setLike } from '@/features/profile/service/social';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

// Pone (liked:true) o quita (liked:false) el «me gusta». Repetirlo no duplica.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  if(typeof body.liked!=='boolean')throw new ValidationError('Indica si das o quitas el me gusta.');
  const result=await setLike(deps().store,ctxFor(user.id),ctx.params.id,body.liked);
  await flushNotifications();
  return result;
});
