import { getThread } from '@/features/market/service/messages';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>getThread(deps().store,requireUser(ctx).id,ctx.params.id));
