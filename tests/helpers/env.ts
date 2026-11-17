import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { FileMediaStore, FileStore } from '../../src/server/storage/file-driver.ts';
import { PgMediaStore, PgStore } from '../../src/server/storage/pg-driver.ts';
import { emptyFarmData } from '../../src/server/farm-template.ts';
import { applyFarmSave } from '../../src/features/market/service/farm-guard.ts';
import type { MediaStore, Store } from '../../src/server/storage/types.ts';

export type Json = Record<string, unknown>;

export function bird(overrides: Json = {}): Json {
  const id = String(overrides.id ?? `bird-${randomUUID()}`);
  return { id, code: `AVE-${id.slice(-6)}`, name: 'Luna', sex: 'Gallina', breed: 'Criolla', coopId: 'coop-1', status: 'Activo', bornAt: '2025-06-01', origin: 'Nacida en la granja', motherId: '', fatherId: '', photo: '', notes: 'NOTA-PRIVADA-NO-PUBLICAR', ...overrides };
}

export interface TestEnv {
  store: Store; media: MediaStore; dir: string; now: Date;
  addUser(name: string, extra?: Json): Promise<string>;
  saveFarm(userId: string, patch: Json): Promise<number>;
  farm(userId: string): Promise<Json>;
  cleanup(): Promise<void>;
}

// Entorno aislado con driver de archivo en un directorio temporal.
export async function makeEnv(): Promise<TestEnv> {
  const dir = await mkdtemp(join(tmpdir(), 'pico-env-'));
  // PICO_TEST_DRIVER=postgres corre la misma suite contra PostgreSQL real (usa TEST_PGDATABASE, PGHOST, PGPORT, PGUSER, PGPASSWORD).
  // Ejecutar con --test-concurrency=1: cada entorno vacía la base de pruebas.
  const pg = process.env.PICO_TEST_DRIVER === 'postgres' ? await openPostgres() : undefined;
  const store: Store = pg?.store ?? new FileStore(join(dir, 'pico.json'));
  const media: MediaStore = pg?.media ?? new FileMediaStore(join(dir, 'media'));
  const env: TestEnv = {
    store, media, dir, now: new Date('2026-10-14T15:00:00.000Z'),
    async addUser(name, extra = {}) {
      const id = randomUUID();
      await store.tx(async tx => {
        await tx.users.insert({ id, email: `${name.toLowerCase()}@correo.test`, passwordHash: 'secreto-hash', createdAt: env.now.toISOString(), displayName: name, ...extra });
        await tx.farms.insert({ id, data: emptyFarmData(), version: 1, updatedAt: env.now.toISOString() });
      });
      return id;
    },
    async saveFarm(userId, patch) {
      return store.tx(async tx => {
        const farm = (await tx.farms.get(userId))!;
        const res = await applyFarmSave(tx, userId, { data: { ...farm.data, ...patch }, version: farm.version }, env.now);
        return res.version;
      });
    },
    async farm(userId) { return store.tx(async tx => (await tx.farms.get(userId))!.data); },
    cleanup: async () => { await pg?.close(); await rm(dir, { recursive: true, force: true }); },
  };
  return env;
}

async function openPostgres() {
  const database = process.env.TEST_PGDATABASE;
  if (!database || !/prueba|test/i.test(database)) throw new Error('PICO_TEST_DRIVER=postgres exige TEST_PGDATABASE con "prueba" o "test" en el nombre.');
  const pool = new Pool({ host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432), database, user: process.env.PGUSER, password: process.env.PGPASSWORD, max: 4 });
  const store = new PgStore(pool);
  await store.tx(async () => undefined);
  const tables = await pool.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'pc\\_%' OR tablename IN ('app_users','app_sessions','farm_data'))`);
  await pool.query(`TRUNCATE ${tables.rows.map(row => row.tablename).join(', ')} CASCADE`);
  return { store, media: new PgMediaStore(pool), close: () => pool.end() };
}
