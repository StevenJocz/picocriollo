import type { Tx, Store, UserRecord } from './storage/types.ts';
import { DEMO_USER_IDS, LEGACY_DEMO_USER_IDS } from './demo-ids.ts';

export const SOCIAL_SAMPLE_REAL_USER_LIMIT = 20;

const samples: Pick<UserRecord, 'id' | 'email' | 'displayName'>[] = [
  { id: DEMO_USER_IDS.roble, email: 'muestra.roble@pico-criollo.invalid', displayName: 'Muestra · Finca El Roble' },
  { id: DEMO_USER_IDS.semilla, email: 'muestra.semilla@pico-criollo.invalid', displayName: 'Muestra · Criadero La Semilla' },
  { id: DEMO_USER_IDS.montana, email: 'muestra.montana@pico-criollo.invalid', displayName: 'Muestra · Granja La Montaña' },
];

const posts = [
  { id: 'demo-post-roble-1', authorId: DEMO_USER_IDS.roble, daysAgo: 3, image: '/fotos/ave-gallina.jpg', text: 'Así se vería una publicación del criadero. Foto ilustrativa; esta cuenta y sus datos son de muestra. #GallinaCriolla #PicoCriollo' },
  { id: 'demo-post-semilla-1', authorId: DEMO_USER_IDS.semilla, daysAgo: 2, image: '/fotos/ave-pollito.jpg', text: 'Un espacio para compartir novedades del levante. Imagen y perfil de demostración, no representa una granja real. #Pollitos #Avicultura' },
  { id: 'demo-post-montana-1', authorId: DEMO_USER_IDS.montana, daysAgo: 1, image: '/fotos/ave-gallo.jpg', text: 'En los perfiles puedes publicar fotos, videos y novedades. Este contenido es ilustrativo. #GallosCriollos #Comunidad' },
];

/** Synchronizes clearly marked, non-interactive sample profiles and posts. */
export async function syncDemoCommunityIn(tx: Tx, now: Date, realUserCount?: number): Promise<boolean> {
  const users = await tx.users.list();
  const realUsers = realUserCount ?? users.filter(user => !user.demo).length;
  const demoUsers = users.filter(user => user.demo);

  if (realUsers >= SOCIAL_SAMPLE_REAL_USER_LIMIT) {
    const demoIds = new Set(demoUsers.map(user => user.id));
    const demoPosts = (await tx.posts.list()).filter(post => post.demo || demoIds.has(post.authorId));
    const postIds = new Set(demoPosts.map(post => post.id));
    for (const row of await tx.postLikes.list()) if (postIds.has(row.postId) || demoIds.has(row.userId)) await tx.postLikes.remove(row.id);
    for (const row of await tx.postComments.list()) if (postIds.has(row.postId) || demoIds.has(row.authorId)) await tx.postComments.remove(row.id);
    for (const row of await tx.follows.list()) if (demoIds.has(row.followerId) || demoIds.has(row.followingId)) await tx.follows.remove(row.id);
    for (const row of demoPosts) await tx.posts.remove(row.id);
    for (const row of await tx.sessions.list()) if (demoIds.has(row.userId)) await tx.sessions.remove(row.id);
    for (const user of demoUsers) {
      const farm = await tx.farms.get(user.id);
      if (farm) await tx.farms.remove(user.id);
      await tx.users.remove(user.id);
    }
    return false;
  }

  // Versiones anteriores crearon estas cuentas con ids que no son UUID: se retiran (con sus publicaciones) antes de crear las nuevas.
  for (const legacyId of LEGACY_DEMO_USER_IDS) {
    if (!(await tx.users.get(legacyId))) continue;
    for (const post of await tx.posts.list()) if (post.authorId === legacyId) await tx.posts.remove(post.id);
    await tx.users.remove(legacyId);
  }
  const at = now.getTime();
  for (const sample of samples) {
    if (!(await tx.users.get(sample.id))) {
      await tx.users.insert({ ...sample, passwordHash: 'disabled-demo-account', createdAt: new Date(at - 30 * 86_400_000).toISOString(), demo: true });
    }
  }
  for (const post of posts) {
    if (await tx.posts.get(post.id)) continue;
    const createdAt = new Date(at - post.daysAgo * 86_400_000).toISOString();
    await tx.posts.insert({ id: post.id, authorId: post.authorId, text: post.text, mediaIds: [], createdAt, updatedAt: createdAt, demo: true, demoImageUrl: post.image });
  }
  return true;
}

export async function syncDemoCommunity(store: Store, now = new Date()): Promise<boolean> {
  return store.tx(tx => syncDemoCommunityIn(tx, now));
}

