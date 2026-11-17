import { setSocialLinks } from '@/features/profile/service/social-links';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps } from '@/server/context';

export const runtime='nodejs';

// Guarda los enlaces del perfil a TikTok, Instagram y YouTube (solo perfiles). Una red vacía se quita; las que no se envían no cambian.
export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return {links:await setSocialLinks(deps(),ctxFor(user.id),body)};
});
