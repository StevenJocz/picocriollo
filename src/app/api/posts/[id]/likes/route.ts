import { listLikers } from '@/features/profile/service/social';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Quién dio me gusta (alias y foto; nunca el correo). Requiere sesión, como el feed.
export const GET=route({auth:true},async ctx=>listLikers(deps().store,ctx.params.id));
