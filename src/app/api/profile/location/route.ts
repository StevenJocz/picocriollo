import { setLocation } from '@/features/profile/service/location';
import { readBody, requireUser, route } from '@/server/api';
import { ctxFor, deps } from '@/server/context';

export const runtime='nodejs';

// Guarda la ciudad (y departamento) de la cuenta para mostrar primero lo cercano. Con la ciudad vacía la quita.
export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  return {location:(await setLocation(deps(),ctxFor(user.id),body))??null};
});
