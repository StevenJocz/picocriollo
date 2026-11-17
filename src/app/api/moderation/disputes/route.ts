import { listDisputes } from '@/features/market/service/moderation';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>({items:await listDisputes(deps().store,requireUser(ctx).id)}));
