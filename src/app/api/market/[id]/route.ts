import { getListingForViewer } from '@/features/market/service/listings';
import { route } from '@/server/api';
import { deps, lazyJobs } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>{await lazyJobs();return getListingForViewer(deps().store,ctx.params.id,ctx.user?.id);});
