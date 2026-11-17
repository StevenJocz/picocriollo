import { learnIn } from './reel-signals.ts';
import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import type { FollowRecord, Store, Tx } from '../../../server/storage/types.ts';
import type { Ctx } from '../../market/service/listings.ts';

export interface SocialStats { followers: number; following: number; publications: number; isFollowing: boolean; }

export async function socialStatsIn(tx: Tx, profileId: string, viewerId?: string): Promise<SocialStats> {
  const [followers, following, posts] = await Promise.all([
    tx.follows.list({ followingId: profileId }),
    tx.follows.list({ followerId: profileId }),
    tx.posts.list({ authorId: profileId }),
  ]);
  const relation = viewerId && viewerId !== profileId ? await tx.follows.get(`${viewerId}:${profileId}`) : undefined;
  return {
    followers: followers.length,
    following: following.length,
    publications: posts.filter(post => !post.hiddenAt).length,
    isFollowing: Boolean(relation),
  };
}

export async function followUser(store: Store, ctx: Ctx, profileId: string, follow: boolean) {
  return store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    if (ctx.userId === profileId) throw new ValidationError('No puedes seguir tu propia cuenta.');
    const profile = await tx.users.get(profileId);
    if (!profile || profile.suspendedAt || profile.demo) throw new NotFoundError('Criador no encontrado.');
    await assertRate(tx, ctx.userId, 'social.follow', ctx.now);

    const id = `${ctx.userId}:${profileId}`;
    const existing = await tx.follows.get(id);
    if (follow && !existing) {
      const record: FollowRecord = { id, followerId: ctx.userId, followingId: profileId, createdAt: ctx.now.toISOString() };
      await tx.follows.insert(record);
      await learnIn(tx, ctx.userId, [{ tags: [], authorId: profileId, type: 'follow' }], ctx.now);
      await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'social.follow', targetType: 'user', targetId: profileId, detail: {}, createdAt: ctx.now.toISOString() });
    } else if (!follow && existing) {
      await tx.follows.remove(id);
      await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'social.follow', targetType: 'user', targetId: profileId, detail: { unfollow: true }, createdAt: ctx.now.toISOString() });
    }
    const stats = await socialStatsIn(tx, profileId, ctx.userId);
    return { following: stats.isFollowing, followers: stats.followers, followingCount: (await tx.follows.list({ followerId: ctx.userId })).length };
  });
}

