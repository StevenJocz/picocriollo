import { channelStatus } from '@/features/notifications/service/channels';
import { requireUser, route } from '@/server/api';

export const runtime='nodejs';

// Solo figuran como configurados los canales con credenciales reales en el entorno.
export const GET=route({auth:true},async ctx=>{
  requireUser(ctx);
  return {channels:channelStatus()};
});
