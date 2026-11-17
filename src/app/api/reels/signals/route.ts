import { recordReelSignals, type ClientSignal } from '@/features/profile/service/reel-signals';
import { readBody, requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime = 'nodejs';

// El navegador informa cuánto tiempo estuvo a la vista cada reel y los toques en avisos; con eso se aprenden los gustos de la persona.
export const POST = route({ auth: true, mutating: true }, async ctx => {
  const user = requireUser(ctx), body = await readBody(ctx.request);
  const list = Array.isArray(body.signals) ? (body.signals as ClientSignal[]) : [];
  return recordReelSignals(deps().store, user.id, list);
});
