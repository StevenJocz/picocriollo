import { followUser } from '@/features/profile/service/follows';
import { readBody, requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime = 'nodejs';

export const POST = route({ auth: true, mutating: true }, async ctx => {
  const user = requireUser(ctx);
  await readBody(ctx.request);
  return followUser(deps().store, { userId: user.id, now: new Date() }, ctx.params.id, true);
});

export const DELETE = route({ auth: true, mutating: true }, async ctx => {
  const user = requireUser(ctx);
  await readBody(ctx.request);
  return followUser(deps().store, { userId: user.id, now: new Date() }, ctx.params.id, false);
});
