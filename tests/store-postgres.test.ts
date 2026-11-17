import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Pool } from 'pg';
import { generateDdl } from '../src/server/storage/ddl.ts';
import { PgStore } from '../src/server/storage/pg-driver.ts';
import { storeContract } from './helpers/store-contract.ts';

test('la migración comprometida coincide con la generada desde specs.ts', () => {
  const committed = readFileSync(new URL('../database/migrations/002_market.sql', import.meta.url), 'utf8');
  assert.equal(committed, generateDdl());
});

test('el SQL generado define el único parcial de bloqueos por ave', () => {
  const sql = generateDdl();
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS pc_bird_locks_birdid_uq ON pc_bird_locks \(\(data->>'birdId'\)\) WHERE \(data->>'status'\) = 'active';/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS pc_notifications_userid_dedupekey_uq/);
});

// Solo corre con una base de pruebas real: TEST_PGDATABASE (usa PGHOST/PGPORT/PGUSER/PGPASSWORD). Si falta, se reporta omitida.
const pgConfigured = Boolean(process.env.TEST_PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD);
storeContract('PgStore', async () => {
  const pool = new Pool({ host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432), database: process.env.TEST_PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
  const store = new PgStore(pool);
  await store.tx(async () => undefined);
  const wipe = async () => { await pool.query('TRUNCATE app_users CASCADE; TRUNCATE pc_bird_locks, pc_notifications, pc_outbox, pc_listings'); };
  await wipe();
  return { store, cleanup: async () => { await wipe(); await pool.end(); } };
}, { skip: pgConfigured ? undefined : 'Sin TEST_PGDATABASE: la prueba contra PostgreSQL real se omite.' });
