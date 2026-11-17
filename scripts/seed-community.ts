// Crea (o borra) una comunidad de ejemplo de 24 criaderos con granjas, fotos, publicaciones y avisos, para revisar el diseño con la app llena.
// Uso:   node --experimental-strip-types scripts/seed-community.ts --confirmar          (crear lo que falte)
//        node --experimental-strip-types scripts/seed-community.ts --confirmar --borrar (eliminar las cuentas de ejemplo y su contenido)
// Lee la misma configuración que la app: STORAGE_DRIVER y PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD (o STORAGE_FILE_PATH con el driver de archivo).
import { join } from 'node:path';
import { Pool } from 'pg';
import { FileMediaStore, FileStore } from '../src/server/storage/file-driver.ts';
import { PgMediaStore, PgStore } from '../src/server/storage/pg-driver.ts';
import type { MediaStore, Store } from '../src/server/storage/types.ts';
import { loadSeedAssets } from '../src/server/seed-community/assets.ts';
import { removeSeedCommunity, seedCommunity } from '../src/server/seed-community/seed.ts';

const args = new Set(process.argv.slice(2));
const driver = process.env.STORAGE_DRIVER === 'postgres' ? 'postgres' : 'file';
let pool: Pool | undefined, store: Store, media: MediaStore;
if (driver === 'postgres') {
  const { PGDATABASE, PGUSER, PGPASSWORD } = process.env;
  if (!PGDATABASE || !PGUSER || !PGPASSWORD) throw new Error('Faltan PGDATABASE, PGUSER o PGPASSWORD.');
  pool = new Pool({ host: process.env.PGHOST || 'postgres', port: Number(process.env.PGPORT || 5432), database: PGDATABASE, user: PGUSER, password: PGPASSWORD, max: 4 });
  store = new PgStore(pool); media = new PgMediaStore(pool);
} else {
  const root = process.env.STORAGE_FILE_PATH || join(process.cwd(), '.data', 'pico.json');
  store = new FileStore(root); media = new FileMediaStore(join(root, '..', 'media'));
}
const where = driver === 'postgres' ? `PostgreSQL ${process.env.PGDATABASE}@${process.env.PGHOST || 'postgres'}` : 'archivo local';
if (!args.has('--confirmar')) {
  console.log(`Destino: ${where}. Falta --confirmar para ${args.has('--borrar') ? 'BORRAR' : 'crear'} la comunidad de ejemplo.`);
  process.exit(1);
}
try {
  if (args.has('--borrar')) {
    const result = await removeSeedCommunity({ store, media });
    console.log(`Listo: ${result.users} cuentas de ejemplo eliminadas de ${where}.`);
  } else {
    const root = process.env.SEED_IMAGES_DIR || join(process.cwd(), 'public', 'seed');
    const report = await seedCommunity({ store, media }, loadSeedAssets(root), { log: message => console.log(message) });
    console.log(`\nListo en ${where}: ${report.users} cuentas nuevas (${report.skipped} ya existían), ${report.posts} publicaciones, ${report.listings} avisos (${Object.entries(report.listingsByType).map(([type, n]) => `${n} ${type}`).join(', ')}), ${report.follows} seguimientos, ${report.likes} me gusta y ${report.comments} comentarios.`);
  }
} finally { await pool?.end(); }
