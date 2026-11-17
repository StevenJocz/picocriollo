import { listReports } from '@/features/market/service/moderation';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Solo moderadores y administradores (se valida el rol en el servidor).
export const GET=route({auth:true},async ctx=>({items:await listReports(deps().store,requireUser(ctx).id,new URL(ctx.request.url).searchParams.get('status')??undefined)}));
