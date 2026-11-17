import { getContact } from '@/features/market/service/operations';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// El contacto solo se entrega cuando ambas partes lo autorizaron (validado en el servidor).
export const GET=route({auth:true},async ctx=>getContact(deps().store,requireUser(ctx).id,ctx.params.id));
