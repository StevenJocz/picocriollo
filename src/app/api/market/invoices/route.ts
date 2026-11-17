import { listInvoices } from '@/features/market/service/invoices';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Facturas del usuario de sesión: compras y ventas completadas.
export const GET=route({auth:true},async ctx=>{
  const role=new URL(ctx.request.url).searchParams.get('role');
  return listInvoices(deps().store,requireUser(ctx).id,role==='comprador'||role==='vendedor'?role:undefined);
});
