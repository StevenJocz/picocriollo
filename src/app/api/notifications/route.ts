import { listNotifications, markAllRead, markLinkRead, markRead } from '@/features/notifications/service/center';
import { readBody, requireUser, route, str } from '@/server/api';
import { deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx),q=new URL(ctx.request.url).searchParams;
  await flushNotifications();
  const status=q.get('status');
  if(status&&!['todas','no_leidas','leidas'].includes(status))throw new ValidationError('Estado no válido.');
  const limit=q.get('limit')?Number(q.get('limit')):undefined;
  return {items:await listNotifications(deps().store,user.id,{status:(status as 'todas'|'no_leidas'|'leidas'|null)??undefined,category:q.get('category')??undefined,limit:Number.isFinite(limit)?limit:undefined,before:q.get('before')??undefined})};
});

export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request),action=str(body.action,'La acción',20,true),now=new Date();
  if(action==='read')return {changed:await markRead(deps().store,user.id,Array.isArray(body.ids)?body.ids as string[]:[],now)};
  if(action==='read-all')return {changed:await markAllRead(deps().store,user.id,now)};
  if(action==='read-link')return {changed:await markLinkRead(deps().store,user.id,str(body.type,'El tipo',60,true),str(body.linkId,'El enlace',120,true),now)};
  throw new ValidationError('Acción no válida.');
});
