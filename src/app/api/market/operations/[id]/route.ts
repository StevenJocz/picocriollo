import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, markDelivered, openDispute, respondPurchase, shareContact, withdrawRequest } from '@/features/market/service/operations';
import { readBody, requireUser, route, str } from '@/server/api';
import { ctxFor, deps, flushNotifications } from '@/server/context';
import { ValidationError } from '@/server/errors';

export const runtime='nodejs';

// Una sola ruta para todo el ciclo. Cada acción valida rol y estado en el servidor.
export const PATCH=route({auth:true,mutating:true},async ctx=>{
  const user=requireUser(ctx),body=await readBody(ctx.request),action=str(body.action,'La acción',30,true),c=ctxFor(user.id),store=deps().store,id=ctx.params.id;
  let result:{id:string;status:string;receiptCode?:string};
  switch(action){
    case 'accept':{const op=await respondPurchase(store,c,id,'accept');result={id:op.id,status:op.status};break;}
    case 'reject':{const op=await respondPurchase(store,c,id,'reject');result={id:op.id,status:op.status};break;}
    case 'withdraw':{const op=await withdrawRequest(store,c,id);result={id:op.id,status:op.status};break;}
    case 'declare-payment':{const op=await declarePayment(store,c,id,body.method);result={id:op.id,status:op.status};break;}
    case 'confirm-payment':{const op=await confirmPayment(store,c,id);result={id:op.id,status:op.status};break;}
    case 'deliver':{const op=await markDelivered(store,c,id);result={id:op.id,status:op.status};break;}
    case 'receive':{const done=await confirmReceipt(store,c,id);result={id:done.operation.id,status:done.operation.status,receiptCode:done.receiptCode};break;}
    case 'cancel':{const op=await cancelOperation(store,c,id,body.reason);result={id:op.id,status:op.status};break;}
    case 'dispute':{const op=await openDispute(store,c,id,body.reason);result={id:op.id,status:op.status};break;}
    case 'share-contact':{const op=await shareContact(store,c,id);result={id:op.id,status:op.status};break;}
    default:throw new ValidationError('Acción no válida.');
  }
  await flushNotifications();
  return result;
});
