import { join } from 'node:path';
import { pool } from '../db';
import { FileMediaStore, FileStore } from './file-driver.ts';
import { PgMediaStore, PgStore } from './pg-driver.ts';
import type { MediaStore, Store } from './types.ts';

export type StorageDriver = 'file' | 'postgres';

// STORAGE_DRIVER manda. Sin definir: desarrollo usa archivo local, producción exige PostgreSQL.
export function resolveDriver(env: Record<string, string | undefined> = process.env): StorageDriver {
  const wanted = env.STORAGE_DRIVER;
  if (wanted === 'file' || wanted === 'postgres') return wanted;
  if (wanted) throw new Error(`STORAGE_DRIVER no válido: ${wanted}. Usa "file" o "postgres".`);
  return env.NODE_ENV === 'production' ? 'postgres' : 'file';
}

interface Bundle { store: Store; media: MediaStore; }
const KEY = Symbol.for('pico-criollo.storage');

function bundle(): Bundle {
  const holder = globalThis as unknown as Record<symbol, Bundle | undefined>;
  if (holder[KEY]) return holder[KEY]!;
  const driver = resolveDriver();
  const root = process.env.STORAGE_FILE_PATH || join(process.cwd(), '.data', 'pico.json');
  const created: Bundle = driver === 'postgres'
    ? { store: new PgStore(pool), media: new PgMediaStore(pool) }
    : { store: new FileStore(root), media: new FileMediaStore(join(root, '..', 'media')) };
  holder[KEY] = created;
  return created;
}

export const getStore = (): Store => bundle().store;
export const getMedia = (): MediaStore => bundle().media;
