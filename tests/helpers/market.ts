import { EVENT_TYPES } from '../../src/features/notifications/service/event-registry.ts';
import { processOutbox } from '../../src/features/notifications/service/outbox.ts';
import { listNotifications } from '../../src/features/notifications/service/center.ts';
import { createListing } from '../../src/features/market/service/listings.ts';
import type { ListingInput } from '../../src/features/market/service/listings.ts';
import { bird } from './env.ts';
import type { TestEnv } from './env.ts';

export const MIN = 60_000, HOUR = 3_600_000;
export const at = (env: TestEnv, ms: number) => new Date(env.now.getTime() + ms);
export const deps = (env: TestEnv) => ({ store: env.store, media: env.media });
export const ctx = (env: TestEnv, userId: string, now: Date = env.now) => ({ userId, now });
export const flush = (env: TestEnv, now: Date = env.now) => processOutbox(env.store, now, { registry: EVENT_TYPES });
export const status = (code: number) => (error: { status?: number }) => error.status === code;

export async function notes(env: TestEnv, userId: string, type?: string) {
  await flush(env);
  return (await listNotifications(env.store, userId)).filter(row => !type || row.type === type);
}

/** Vendedor con una gallina "Luna" lista para publicar. */
export async function sellerWithBird(env: TestEnv, name = 'Ana') {
  const sellerId = await env.addUser(name);
  await env.saveFarm(sellerId, { birds: [bird({ id: 'luna', name: 'Luna', code: 'AVE-0003', breed: 'Criolla' }), bird({ id: 'otra', name: 'Otra', code: 'AVE-0004' })] });
  return sellerId;
}

export async function publishFixed(env: TestEnv, sellerId: string, price = 85000, birdId = 'luna') {
  return createListing(deps(env), ctx(env, sellerId), { birdId, kind: 'fixed', price, publish: true });
}

export async function publishAuction(env: TestEnv, sellerId: string, overrides: Partial<NonNullable<ListingInput['auction']>> = {}, birdId = 'luna') {
  return createListing(deps(env), ctx(env, sellerId), {
    birdId, kind: 'auction', publish: true,
    auction: { startingPrice: 50000, closesAt: at(env, 48 * HOUR).toISOString(), ...overrides },
  });
}
