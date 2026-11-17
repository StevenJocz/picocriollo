import { addInterest, listInterests, withdrawInterest } from '@/features/market/service/listings';
import { readBody, requireUser, route, str } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

// Solo el vendedor ve a los interesados (con alias, sin correo ni teléfono).
export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  return {items:await listInterests(deps(),ctxFor(user.id),ctx.params.id)};
});

export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request),action=str(body.action,'La acción',20,true);
  if(action==='add'){
    const interest=await addInterest(deps(),ctxFor(user.id),ctx.params.id,str(body.message,'El mensaje',500));
    await flushNotifications();
    return {status:interest.status};
  }
  if(action==='withdraw'){await withdrawInterest(deps(),ctxFor(user.id),ctx.params.id);return {status:'retirado'};}
  throw new ValidationError('Acción no válida.');
});
