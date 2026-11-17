import { notificationSummary } from '@/features/notifications/service/center';
import { requireUser, route } from '@/server/api';
import { deps, flushNotifications, lazyJobs, lazyReminders } from '@/server/context';

export const runtime='nodejs';

// Sondeo de la campana: procesa eventos pendientes y devuelve el contador.
export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  await lazyJobs();
  await lazyReminders(user.id);
  await flushNotifications();
  return notificationSummary(deps().store,user.id);
});
