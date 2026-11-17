import { listReplies } from '@/features/profile/service/social';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Todas las respuestas de un comentario principal, de la más vieja a la más nueva. Públicas.
export const GET=route({auth:true},async ctx=>({items:await listReplies(deps().store,ctx.params.id,ctx.user?.id)}));
