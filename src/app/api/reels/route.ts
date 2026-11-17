import { listPublicReels } from '@/features/profile/service/posts';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';
import { syncDemoCommunity } from '@/server/demo-community';

export const runtime = 'nodejs';

export const GET = route({ auth: true }, async ctx => {
  const q = new URL(ctx.request.url).searchParams;
  await syncDemoCommunity(deps().store);
  const limit = Number(q.get('limit'));
  return listPublicReels(deps().store, {
    before: q.get('before') ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    tag: q.get('tag') ?? undefined,
    q: q.get('q') ?? undefined,
    // Sin búsqueda ni etiqueta el feed es «Para ti»: `seen` son las claves cortas de lo ya visto y `seed` cambia en cada visita.
    mode: q.get('tag') || q.get('q') ? 'chronological' : 'foryou',
    seen: (q.get('seen') ?? '').split(',').filter(key => /^[pas]:[\w-]{1,8}$/i.test(key)).slice(-200),
    seed: (q.get('seed') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 16),
  }, requireUser(ctx).id);
});
