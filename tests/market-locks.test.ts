import assert from 'node:assert/strict';
import test from 'node:test';
import { activeLocks, freeOperationLocks, releaseLocks, reserveLocks } from '../src/features/market/service/locks.ts';
import { makeEnv } from './helpers/env.ts';
import { publishFixed, sellerWithBird } from './helpers/market.ts';

test('los bloqueos de una publicación se reservan, liberan y sueltan como conjunto', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    const listing = await publishFixed(env, ana);
    await env.store.tx(async tx => {
      assert.equal((await activeLocks(tx, listing.id)).length, 1);
      await reserveLocks(tx, listing.id, 'op-1');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, 'op-1');
      await freeOperationLocks(tx, listing.id, 'op-otra');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, 'op-1');
      await freeOperationLocks(tx, listing.id, 'op-1');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, undefined);
      await releaseLocks(tx, listing.id, env.now);
      assert.equal((await activeLocks(tx, listing.id)).length, 0);
    });
  } finally { await env.cleanup(); }
});
