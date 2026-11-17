import { cancelAuction } from '@/features/market/service/auction';
import { pauseListing, publishListing, refreshSnapshot, resumeListing, updateListing, withdrawListing } from '@/features/market/service/listings';
import { readBody, requireUser, route, str } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

export const PATCH=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request),id=ctx.params.id,c=ctxFor(user.id),d=deps();
  const action=str(body.action,'La acción',30,true);
  let listing;
  switch(action){
    case 'publish':listing=await publishListing(d,c,id);break;
    case 'pause':listing=await pauseListing(d,c,id);break;
    case 'resume':listing=await resumeListing(d,c,id);break;
    case 'withdraw':listing=await withdrawListing(d,c,id);break;
    case 'cancel-auction':listing=await cancelAuction(d.store,c,id,body.reason);break;
    case 'refresh':listing=await refreshSnapshot(d,c,id);break;
    case 'update':{
      const consent=body.consent;
      if(consent!==undefined&&(typeof consent!=='object'||consent===null||Array.isArray(consent)))throw new ValidationError('Los consentimientos no son válidos.');
      listing=await updateListing(d,c,id,{price:body.price===undefined?undefined:Number(body.price),terms:body.terms===undefined?undefined:str(body.terms,'Las condiciones',1000),consent:consent as Record<string,unknown>|undefined,photos:body.photos});
      break;
    }
    default:throw new ValidationError('Acción no válida.');
  }
  await flushNotifications();
  return {id:listing.id,status:listing.status,needsReview:listing.needsReview,version:listing.version};
});
