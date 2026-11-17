import { isValidTimeZone } from '@/features/notifications/service/preferences';
import { readBody, requireUser, route, str } from '@/server/api';
import { assertUsernameFree, validateUsername } from '@/server/accounts';
import { deps } from '@/server/context';
import { NotFoundError, ValidationError } from '@/server/errors';

export const runtime='nodejs';

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  const row=await deps().store.tx(tx=>tx.users.get(user.id));
  if(!row)throw new NotFoundError('Cuenta no encontrada.');
  return {profile:{id:row.id,email:row.email,displayName:row.displayName??'',avatarUrl:row.avatarId?`/api/media/${row.avatarId}`:null,timeZone:row.timeZone??'America/Bogota',role:row.role??'user',contactPhone:row.contactPhone??'',location:row.location??null}};
});

// El alias público reemplaza al correo en el mercado: no puede parecerse a uno ni contener enlaces.
export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const typed=str(body.displayName,'El nombre de usuario',80);
  const displayName=typed?validateUsername(typed):'';
  const contactPhone=str(body.contactPhone,'El teléfono',30);
  if(contactPhone&&!/^[+\d][\d\s().-]{6,28}$/.test(contactPhone))throw new ValidationError('El teléfono solo admite números, espacios y los signos + ( ) - .');
  const timeZone=str(body.timeZone,'La zona horaria',60);
  if(timeZone&&!isValidTimeZone(timeZone))throw new ValidationError('Zona horaria no válida.');
  await deps().store.tx(async tx=>{
    const row=await tx.users.get(user.id);
    if(!row)throw new NotFoundError('Cuenta no encontrada.');
    if(displayName)await assertUsernameFree(tx,displayName,user.id);
    await tx.users.update({...row,displayName:displayName||undefined,timeZone:timeZone||row.timeZone,contactPhone:contactPhone||undefined});
  });
  return {ok:true};
});
