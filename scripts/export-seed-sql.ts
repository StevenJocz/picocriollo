// Genera los scripts SQL para cargar (o borrar) la comunidad de ejemplo desde pgAdmin, sin necesidad de ejecutar la app.
// Siembra en un almacén temporal con los mismos servicios que usa la app y vuelca el resultado como INSERT.
// Uso: npm run seed:sql   → database/seed/comunidad-ejemplo.sql y database/seed/borrar-comunidad-ejemplo.sql
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileMediaStore, FileStore } from '../src/server/storage/file-driver.ts';
import { generateDdl } from '../src/server/storage/ddl.ts';
import { COLLECTIONS } from '../src/server/storage/specs.ts';
import type { CollectionName } from '../src/server/storage/types.ts';
import { PROFILES, SEED_EMAIL_DOMAIN, seedEmail, seedSocialLinks } from '../src/server/seed-community/profiles.ts';
import { loadSeedAssets } from '../src/server/seed-community/assets.ts';
import { seedCommunity } from '../src/server/seed-community/seed.ts';

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => {
  const text = JSON.stringify(value);
  if (text.includes('$seed$')) throw new Error('El contenido trae el delimitador $seed$.');
  return `$seed$${text}$seed$::jsonb`;
};
const wrap = (base64: string) => base64.replace(/(.{100})/g, '$1\n');
const table = (name: CollectionName) => COLLECTIONS.find(spec => spec.name === name)!.table;

const dir = await mkdtemp(join(tmpdir(), 'seed-sql-'));
try {
  const store = new FileStore(join(dir, 'pico.json')), media = new FileMediaStore(join(dir, 'media'));
  const now = new Date();
  const report = await seedCommunity({ store, media }, loadSeedAssets(join(process.cwd(), 'public', 'seed')), { now });

  const lines: string[] = [];
  const images = new Map<string, { mime: string; bytes: Uint8Array }>();
  const mediaRows: { id: string; owner: string; hash: string }[] = [];
  const counts: Record<string, number> = {};

  const dump = await store.tx(async tx => {
    const users = (await tx.users.list()).filter(user => user.email.endsWith(`@${SEED_EMAIL_DOMAIN}`));
    const farms = await Promise.all(users.map(async user => (await tx.farms.get(user.id))!));
    const generic = (['follows', 'ownership', 'ownershipHistory', 'listings', 'locks', 'posts', 'mediaItems', 'postLikes', 'postComments'] as const)
      .map(name => ({ name, rows: [] as { id: string }[] }));
    for (const group of generic) group.rows = (await tx[group.name].list()) as { id: string }[];
    const listings = await tx.listings.list(), items = await tx.mediaItems.list();
    return { users, farms, generic, ids: [...items.map(item => ({ id: item.id, owner: item.ownerId })), ...listings.flatMap(listing => (listing.photoIds ?? []).map(id => ({ id, owner: listing.sellerId })))] };
  });
  for (const { id, owner } of dump.ids) {
    const file = await media.get(id);
    if (!file) throw new Error(`Falta el archivo ${id} en el almacén temporal.`);
    const hash = createHash('sha256').update(file.bytes).digest('hex').slice(0, 24);
    images.set(hash, { mime: file.mime, bytes: file.bytes });
    mediaRows.push({ id, owner, hash });
  }

  lines.push(`-- Comunidad de ejemplo de Pico Criollo: ${dump.users.length} criaderos con granjas, fotos, ${report.posts} publicaciones del muro, ${report.listings} avisos del mercado,`);
  lines.push(`-- ${report.follows} seguimientos, ${report.likes} me gusta y ${report.comments} comentarios. Generado el ${now.toISOString()} por scripts/export-seed-sql.ts.`);
  lines.push('-- Todo es inventado. Las cuentas usan correos @' + SEED_EMAIL_DOMAIN + ' y no pueden iniciar sesión.');
  lines.push('-- Se puede ejecutar varias veces (ON CONFLICT DO NOTHING). Para quitarlo todo: borrar-comunidad-ejemplo.sql.');
  lines.push('-- Ejecútalo conectado a la base de la app (por ejemplo bdpicocriollo) en pgAdmin > Query Tool.');
  lines.push('', 'BEGIN;', '', '-- Tablas (solo se crean si faltan)', generateDdl(), '');

  lines.push('-- Fotos únicas (cada una se guarda una sola vez y se copia a cada publicación, aviso y perfil que la usa)');
  lines.push('CREATE TEMP TABLE seed_img (h text PRIMARY KEY, mime text NOT NULL, bytes bytea NOT NULL) ON COMMIT DROP;');
  for (const [hash, image] of images) lines.push(`INSERT INTO seed_img (h, mime, bytes) VALUES (${q(hash)}, ${q(image.mime)}, decode('${wrap(Buffer.from(image.bytes).toString('base64'))}', 'base64'));`);
  lines.push('');

  lines.push('-- Cuentas y granjas');
  for (const user of dump.users) {
    const profile = { ...(user.displayName ? { displayName: user.displayName } : {}), ...(user.timeZone ? { timeZone: user.timeZone } : {}), ...(user.avatarId ? { avatarId: user.avatarId } : {}), ...(user.social ? { social: user.social } : {}), ...(user.location ? { location: user.location } : {}) };
    lines.push(`INSERT INTO app_users (id, email, password_hash, created_at, profile) VALUES (${q(user.id)}, ${q(user.email)}, ${q(user.passwordHash)}, ${q(user.createdAt)}, ${json(profile)}) ON CONFLICT DO NOTHING;`);
  }
  for (const farm of dump.farms) lines.push(`INSERT INTO farm_data (user_id, data, version, updated_at) VALUES (${q(farm.id)}, ${json(farm.data)}, ${farm.version}, ${q(farm.updatedAt)}) ON CONFLICT DO NOTHING;`);
  lines.push('');

  for (const group of dump.generic) {
    counts[group.name] = group.rows.length;
    if (!group.rows.length) continue;
    lines.push(`-- ${table(group.name)} (${group.rows.length})`);
    for (let i = 0; i < group.rows.length; i += 50) {
      const chunk = group.rows.slice(i, i + 50);
      lines.push(`INSERT INTO ${table(group.name)} (id, data) VALUES\n${chunk.map(row => `  (${q(row.id)}, ${json(row)})`).join(',\n')}\nON CONFLICT DO NOTHING;`);
    }
    lines.push('');
  }

  lines.push(`-- Archivos de fotos (${mediaRows.length})`);
  for (let i = 0; i < mediaRows.length; i += 100) {
    const chunk = mediaRows.slice(i, i + 100);
    lines.push(`INSERT INTO pc_media (id, mime, owner_id, bytes)\nSELECT v.id, s.mime, v.owner, s.bytes FROM (VALUES\n${chunk.map(row => `  (${q(row.id)}, ${q(row.owner)}, ${q(row.hash)})`).join(',\n')}\n) AS v(id, owner, h) JOIN seed_img s ON s.h = v.h\nON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('', 'COMMIT;', '', `-- Comprobación: SELECT count(*) FROM app_users WHERE email LIKE '%@${SEED_EMAIL_DOMAIN}';  -- debe dar ${dump.users.length}`, '');

  const tag = `'%@${SEED_EMAIL_DOMAIN}'`;
  const seed = '(SELECT id FROM seed_users)';
  const remove = [
    '-- Borra la comunidad de ejemplo de Pico Criollo (cuentas @' + SEED_EMAIL_DOMAIN + ' y todo lo que crearon). No toca cuentas reales.',
    'BEGIN;',
    `CREATE TEMP TABLE seed_users ON COMMIT DROP AS SELECT id::text AS id FROM app_users WHERE email LIKE ${tag};`,
    `CREATE TEMP TABLE seed_posts ON COMMIT DROP AS SELECT id FROM ${table('posts')} WHERE data->>'authorId' IN ${seed};`,
    `CREATE TEMP TABLE seed_listings ON COMMIT DROP AS SELECT id FROM ${table('listings')} WHERE data->>'sellerId' IN ${seed};`,
    `DELETE FROM ${table('postLikes')} WHERE data->>'userId' IN ${seed} OR data->>'postId' IN (SELECT id FROM seed_posts);`,
    `DELETE FROM ${table('postComments')} WHERE data->>'authorId' IN ${seed} OR data->>'postId' IN (SELECT id FROM seed_posts);`,
    `DELETE FROM ${table('posts')} WHERE id IN (SELECT id FROM seed_posts);`,
    `DELETE FROM ${table('follows')} WHERE data->>'followerId' IN ${seed} OR data->>'followingId' IN ${seed};`,
    `DELETE FROM ${table('locks')} WHERE data->>'listingId' IN (SELECT id FROM seed_listings);`,
    `DELETE FROM ${table('interests')} WHERE data->>'listingId' IN (SELECT id FROM seed_listings);`,
    `DELETE FROM ${table('bids')} WHERE data->>'listingId' IN (SELECT id FROM seed_listings);`,
    `DELETE FROM ${table('listings')} WHERE id IN (SELECT id FROM seed_listings);`,
    `DELETE FROM ${table('mediaItems')} WHERE data->>'ownerId' IN ${seed};`,
    `DELETE FROM pc_media WHERE owner_id IN ${seed};`,
    `DELETE FROM ${table('ownershipHistory')} WHERE data->>'ownerId' IN ${seed};`,
    `DELETE FROM ${table('ownership')} WHERE data->>'ownerId' IN ${seed};`,
    `DELETE FROM ${table('notifications')} WHERE data->>'userId' IN ${seed};`,
    `DELETE FROM app_users WHERE id::text IN ${seed};  -- sus granjas y sesiones se borran en cascada`,
    'COMMIT;', '',
  ].join('\n');

  const out = join(process.cwd(), 'database', 'seed');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'comunidad-ejemplo.sql'), lines.join('\n'), 'utf8');
  await writeFile(join(out, 'borrar-comunidad-ejemplo.sql'), remove, 'utf8');
  // Para quien ya cargó la comunidad antes de que existieran los enlaces: agrega las redes a esas cuentas.
  const networks = [
    '-- Agrega los enlaces a TikTok, Instagram y YouTube y la ubicación (ciudad y departamento) a las cuentas de ejemplo ya cargadas. No cambia nada más.',
    'BEGIN;',
    ...PROFILES.map((profile, index) => `UPDATE app_users SET profile = profile || jsonb_build_object('social', ${json(seedSocialLinks(profile.slug, index))}, 'location', ${json({ city: profile.city, region: profile.region })}) WHERE email = ${q(seedEmail(profile.slug))};`),
    'COMMIT;', '',
  ].join('\n');
  await writeFile(join(out, 'actualizar-comunidad-ejemplo.sql'), networks, 'utf8');
  console.log(`Escrito database/seed/comunidad-ejemplo.sql (${images.size} fotos únicas, ${mediaRows.length} archivos) y borrar-comunidad-ejemplo.sql.`);
  console.log(JSON.stringify({ users: dump.users.length, posts: report.posts, listings: report.listings, byType: report.listingsByType, counts }));
} finally { await rm(dir, { recursive: true, force: true }); }
