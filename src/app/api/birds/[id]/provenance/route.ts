import { getProvenance } from '@/features/market/service/transfer';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>getProvenance(deps().store,requireUser(ctx).id,ctx.params.id));
