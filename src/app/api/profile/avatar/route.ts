import { setAvatar } from '@/features/profile/service/media';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

// Elige (mediaId) o quita (null) la foto de perfil. La imagen se sube antes con POST /api/media?purpose=avatar.
export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  if(body.mediaId!==null&&typeof body.mediaId!=='string')throw new ValidationError('La foto no es válida.');
  return setAvatar(deps(),ctxFor(user.id),body.mediaId as string|null);
});
