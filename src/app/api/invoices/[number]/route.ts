import { getInvoice } from '@/features/market/service/invoices';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Solo el comprador o el vendedor de la operación pueden ver la factura.
export const GET=route({auth:true},async ctx=>getInvoice(deps().store,requireUser(ctx).id,ctx.params.number));
