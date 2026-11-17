import { applyFarmSave } from '@/features/market/service/farm-guard';
import { route, readBody, requireUser } from '@/server/api';
import { FARM_ARRAYS } from '@/server/farm-template';
import { recordSyncConflict } from '@/features/notifications/service/reminders';
import { ConflictError, HttpError, NotFoundError, ValidationError } from '@/server/errors';
import { getStore } from '@/server/storage';

export const runtime='nodejs';
const MAX_BYTES=12*1024*1024;

export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  const row=await getStore().tx(tx=>tx.farms.get(user.id));
  if(!row)throw new NotFoundError('No existe el espacio de granja de esta cuenta.');
  return {data:row.data,version:row.version};
});

export const PUT=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx);
  const length=Number(ctx.request.headers.get('content-length')||0);
  if(length>MAX_BYTES)throw new HttpError(413,'El respaldo supera el límite de 12 MB.');
  const body=await readBody(ctx.request) as {data?:Record<string,unknown>;version?:number};
  if(!body.data||typeof body.data!=='object'||!Number.isSafeInteger(body.version)||Object.keys(body.data).length>40||FARM_ARRAYS.some(key=>!Array.isArray(body.data?.[key])))throw new ValidationError('La estructura de datos no es válida.');
  if(Buffer.byteLength(JSON.stringify(body.data))>MAX_BYTES)throw new HttpError(413,'El respaldo supera el límite de 12 MB.');
  const data=body.data,version=Number(body.version);
  try{return await getStore().tx(tx=>applyFarmSave(tx,user.id,{data,version},new Date()));}
  catch(error){
    if(error instanceof ConflictError&&/otra sesión/.test(error.message))await recordSyncConflict(getStore(),user.id,new Date()).catch(()=>undefined);
    throw error;
  }
});
