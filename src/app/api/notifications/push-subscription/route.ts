import { createHash } from 'node:crypto';
import { readBody, requireUser, route, str } from '@/server/api';
import { deps } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

// Suscripción Web Push del navegador. Un endpoint pertenece a un solo usuario: si otra cuenta se suscribe desde el
// mismo navegador, la anterior deja de recibir en ese dispositivo.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request),action=str(body.action,'La acción',20,true),store=deps().store;
  if(action==='unsubscribe'){
    const endpoint=str(body.endpoint,'El endpoint',1000,true);
    await store.tx(async tx=>{for(const row of await tx.pushSubscriptions.list({endpoint}))if(row.userId===user.id)await tx.pushSubscriptions.remove(row.id)});
    return {ok:true};
  }
  if(action!=='subscribe')throw new ValidationError('Acción no válida.');
  const sub=body.subscription as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}}|undefined;
  const endpoint=typeof sub?.endpoint==='string'?sub.endpoint:'',p256dh=sub?.keys?.p256dh,auth=sub?.keys?.auth;
  if(!/^https:\/\/[^\s]{10,900}$/.test(endpoint)||typeof p256dh!=='string'||typeof auth!=='string'||p256dh.length>200||auth.length>100)throw new ValidationError('La suscripción del navegador no es válida.');
  const id=createHash('sha256').update(endpoint).digest('hex').slice(0,40);
  await store.tx(async tx=>{
    const existing=await tx.pushSubscriptions.get(id);
    const record={id,userId:user.id,endpoint,keys:{p256dh,auth},createdAt:existing?.createdAt??new Date().toISOString()};
    if(existing)await tx.pushSubscriptions.update(record);else await tx.pushSubscriptions.insert(record);
  });
  return {ok:true};
});
