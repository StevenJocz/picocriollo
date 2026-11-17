import { getReceipt } from '@/features/market/service/transfer';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>getReceipt(deps().store,requireUser(ctx).id,ctx.params.code));
