import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import { DEMO_USER_IDS } from '../src/server/demo-ids.ts';
import { syncDemoCommunity } from '../src/server/demo-community.ts';
import { DEMO_MARKET_LISTINGS } from '../src/features/market/service/demo-listings.ts';
import { makeEnv } from './helpers/env.ts';

// app_users.id, app_sessions.user_id y farm_data.user_id son uuid en PostgreSQL: un id como «demo-social-roble» hace fallar el alta de cuentas (503).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('los usuarios de muestra tienen id UUID válido (PostgreSQL los exige)', async () => {
  const env = await makeEnv();
  try {
    await syncDemoCommunity(env.store, env.now);
    const users = (await env.store.tx(tx => tx.users.list())).filter(user => user.demo);
    assert.equal(users.length, 3);
    for (const user of users) assert.match(user.id, UUID, user.displayName);
    const posts = await env.store.tx(tx => tx.posts.list());
    assert.ok(posts.length >= 3);
    for (const post of posts) assert.ok(users.some(user => user.id === post.authorId), `la publicación ${post.id} apunta a un usuario de muestra`);
    for (const listing of DEMO_MARKET_LISTINGS) assert.ok((Object.values(DEMO_USER_IDS) as string[]).includes(listing.sellerId), `${listing.id} usa un vendedor de muestra`);
  } finally { await env.cleanup(); }
});

test('sincronizar dos veces no duplica la comunidad de muestra', async () => {
  const env = await makeEnv();
  try {
    await syncDemoCommunity(env.store, env.now);
    await syncDemoCommunity(env.store, env.now);
    assert.equal((await env.store.tx(tx => tx.users.list())).filter(user => user.demo).length, 3);
    assert.equal((await env.store.tx(tx => tx.posts.list())).length, 3);
  } finally { await env.cleanup(); }
});

test('los ids de muestra antiguos (no UUID) se retiran al sincronizar', async () => {
  const env = await makeEnv();
  try {
    await env.store.tx(async tx => {
      await tx.users.insert({ id: 'demo-social-roble', email: 'muestra.roble@pico-criollo.invalid', passwordHash: 'disabled-demo-account', createdAt: env.now.toISOString(), displayName: 'Muestra · Finca El Roble', demo: true });
      await tx.posts.insert({ id: 'demo-post-roble-1', authorId: 'demo-social-roble', text: 'antigua', mediaIds: [], createdAt: env.now.toISOString(), updatedAt: env.now.toISOString(), demo: true });
    });
    await syncDemoCommunity(env.store, env.now);
    const users = await env.store.tx(tx => tx.users.list());
    assert.ok(!users.some(user => user.id === 'demo-social-roble'));
    assert.equal(users.filter(user => user.demo).length, 3);
    const posts = await env.store.tx(tx => tx.posts.list());
    assert.ok(!posts.some(post => post.authorId === 'demo-social-roble'));
    assert.equal(posts.find(post => post.id === 'demo-post-roble-1')?.authorId, DEMO_USER_IDS.roble);
    assert.equal(posts.length, 3);
  } finally { await env.cleanup(); }
});

test('crear una cuenta real también deja la comunidad de muestra con ids válidos', async () => {
  const env = await makeEnv();
  try {
    await createAccount(env.store, { email: 'real@correo.test', passwordHash: 'h', username: 'Criador Real', now: env.now });
    const users = await env.store.tx(tx => tx.users.list());
    for (const user of users) assert.match(user.id, UUID, user.email);
  } finally { await env.cleanup(); }
});
