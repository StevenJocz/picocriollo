import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { loadSeedAssets } from '../src/server/seed-community/assets.ts';
import { PROFILES, SEED_EMAIL_DOMAIN } from '../src/server/seed-community/profiles.ts';
import { removeSeedCommunity, seedCommunity } from '../src/server/seed-community/seed.ts';
import { listPublicReels } from '../src/features/profile/service/posts.ts';
import { makeEnv } from './helpers/env.ts';
import { deps } from './helpers/market.ts';

const assets = loadSeedAssets(join(process.cwd(), 'public', 'seed'));

test('la comunidad de ejemplo crea 24 cuentas completas con foto, granja, 20 o más publicaciones y avisos de todo tipo', async () => {
  const env = await makeEnv();
  try {
    const real = await env.addUser('Persona real');
    const report = await seedCommunity(deps(env), assets, { now: env.now });
    assert.equal(report.users, 24);
    assert.ok(report.posts >= 24 * 12, `publicaciones: ${report.posts}`);
    assert.ok(report.listings >= 24 * 9, `avisos: ${report.listings}`);
    for (const type of ['ave', 'lote_aves', 'lote_pollitos', 'lote_huevos', 'insumo']) assert.ok((report.listingsByType[type] ?? 0) >= 20, `avisos de tipo ${type}: ${report.listingsByType[type]}`);
    assert.ok(report.likes > 500 && report.comments > 100 && report.follows > 100);
    await env.store.tx(async tx => {
      const seeded = (await tx.users.list()).filter(user => user.email.endsWith(`@${SEED_EMAIL_DOMAIN}`));
      assert.equal(seeded.length, 24);
      for (const user of seeded) {
        assert.ok(user.avatarId, `${user.displayName} sin foto de perfil`);
        assert.ok(user.location?.city && user.location.region, `${user.displayName} sin ubicación`);
        assert.ok(user.social?.instagram?.startsWith('https://www.instagram.com/'), `${user.displayName} sin enlaces a sus redes`);
        assert.ok(!user.demo, 'las cuentas de ejemplo no son de muestra: se pueden usar con normalidad');
        const farm = (await tx.farms.get(user.id))!.data as { coops: unknown[]; birds: { sex: string }[] };
        assert.ok(farm.coops.length >= 1 && farm.birds.length >= 6, `${user.displayName}: granja pobre`);
        const posts = (await tx.posts.list({ authorId: user.id })).length, listings = (await tx.listings.list({ sellerId: user.id })).filter(row => row.status === 'publicada').length;
        assert.ok(posts >= 12, `${user.displayName}: ${posts} publicaciones del muro`);
        assert.ok(posts + listings >= 22, `${user.displayName}: ${posts + listings} publicaciones en total`);
        assert.ok((farm as unknown as { customProducts: unknown[] }).customProducts.length >= 5, 'insumos en la granja');
      }
    });
    await env.store.tx(async tx => {
      const birds = (await tx.listings.list()).filter(row => (row.itemType ?? 'ave') === 'ave');
      assert.ok(birds.length >= 90, `avisos de aves: ${birds.length}`);
      const withLineage = birds.filter(row => row.snapshot.genealogy?.mother?.name && row.snapshot.genealogy?.father?.name).length;
      assert.equal(withLineage, birds.length, 'todas las aves a la venta muestran madre y padre');
      assert.ok(birds.some(row => row.snapshot.genealogy?.mother?.mother?.name), 'hay linajes con abuela registrada');
    });
    assert.equal(new Set(PROFILES.map(profile => profile.name)).size, 24);
    const breeds = new Set(PROFILES.flatMap(profile => profile.breeds));
    for (const breed of ['Criolla', 'Brahma', 'Orpington', 'Plymouth Rock', 'Sedosa', 'Rhode Island Red', 'Leghorn', 'Araucana', 'Marans', 'Sussex', 'Wyandotte', 'Cochin', 'Australorp', 'Gigante', 'Cubana', 'Ponedora']) assert.ok(breeds.has(breed), `falta la raza ${breed}`);
    const feed = await listPublicReels(env.store, { limit: 30 }, real);
    assert.ok(feed.items.some(item => item.kind === 'post' && item.post.media.length > 0), 'el feed muestra publicaciones con foto');
    assert.ok(feed.items.some(item => item.kind === 'advertisement'), 'el feed muestra avisos del mercado');
  } finally { await env.cleanup(); }
});

test('repetir la siembra no duplica nada y borrarla deja solo las cuentas reales', async () => {
  const env = await makeEnv();
  try {
    const real = await env.addUser('Persona real');
    await seedCommunity(deps(env), assets, { now: env.now });
    const again = await seedCommunity(deps(env), assets, { now: env.now });
    assert.equal(again.users, 0);
    assert.equal(again.skipped, 24);
    const removed = await removeSeedCommunity(deps(env));
    assert.equal(removed.users, 24);
    await env.store.tx(async tx => {
      assert.deepEqual((await tx.users.list()).map(user => user.id), [real]);
      assert.equal((await tx.posts.list()).length, 0);
      assert.equal((await tx.listings.list()).length, 0);
      assert.equal((await tx.mediaItems.list()).length, 0);
      assert.equal((await tx.postLikes.list()).length, 0);
      assert.equal((await tx.follows.list()).length, 0);
      assert.equal((await tx.ownership.list()).length, 0);
    });
  } finally { await env.cleanup(); }
});
