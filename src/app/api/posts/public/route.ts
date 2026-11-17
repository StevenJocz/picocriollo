import { listPublicPosts } from '@/features/profile/service/posts';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime = 'nodejs';

// Feed de la comunidad. Solo incluye publicaciones visibles de perfiles activos y requiere sesión.
export const GET = route({ auth: true }, async ctx => {
  const q = new URL(ctx.request.url).searchParams;
  const limit = Number(q.get('limit'));
  return listPublicPosts(deps().store, {
    before: q.get('before') ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    tag: q.get('tag') ?? undefined,
  }, ctx.user?.id);
});
