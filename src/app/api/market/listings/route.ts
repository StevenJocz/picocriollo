import { createListing } from '@/features/market/service/listings';
import { flag, readBody, requireUser, route, str } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';
import type { AuctionInput } from '@/features/market/service/auction-rules';
import type { ItemType, ListingKind } from '@/server/storage/types';

export const runtime='nodejs';

// El servidor lee el ave de la granja del usuario autenticado: del cuerpo solo toma el id, el tipo, el precio y los consentimientos.
export const POST=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request);
  const kind=str(body.kind,'El tipo de publicación',20,true) as ListingKind;
  const consent=body.consent,auction=body.auction;
  if(consent!==undefined&&(typeof consent!=='object'||consent===null||Array.isArray(consent)))throw new ValidationError('Los consentimientos no son válidos.');
  if(auction!==undefined&&(typeof auction!=='object'||auction===null||Array.isArray(auction)))throw new ValidationError('Las reglas de la subasta no son válidas.');
  const birdIds=body.birdIds;
  if(birdIds!==undefined&&!Array.isArray(birdIds))throw new ValidationError('Las aves del lote no son válidas.');
  const listing=await createListing(deps(),ctxFor(user.id),{itemType:body.itemType as ItemType|undefined,birdId:typeof body.birdId==='string'?body.birdId:undefined,birdIds:birdIds as string[]|undefined,lotId:typeof body.lotId==='string'?body.lotId:undefined,quantity:typeof body.quantity==='number'?body.quantity:undefined,photos:body.photos,kind,price:body.price===undefined?undefined:Number(body.price),terms:str(body.terms,'Las condiciones',1000),consent:consent as Record<string,unknown>|undefined,publish:flag(body.publish),auction:auction as AuctionInput|undefined});
  await flushNotifications();
  return {id:listing.id,status:listing.status};
});
