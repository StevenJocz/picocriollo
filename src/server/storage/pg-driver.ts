import type { Pool, PoolClient } from 'pg';
import { generateDdl, jsonKey } from './ddl.ts';
import { COLLECTIONS } from './specs.ts';
import { StoreConflictError } from './types.ts';
import type { Collection, CollectionName, FarmRecord, MediaStore, SessionRecord, Store, Tx, UserRecord } from './types.ts';

type Row = Record<string, unknown> & { id: string };
const UNIQUE_VIOLATION = '23505';
const SAFE = /^[A-Za-z][A-Za-z0-9]*$/;
// app_users.id y farm_data.user_id son uuid: un id que no lo es (p. ej. las cuentas de muestra antiguas) no puede existir y consultarlo haría fallar la consulta con 22P02.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

// Ejecuta una sentencia dentro de un SAVEPOINT para que un conflicto no deje la transacción abortada.
async function guarded(client: PoolClient, label: string, run: () => Promise<unknown>) {
  await client.query('SAVEPOINT pc_stmt');
  try { await run(); await client.query('RELEASE SAVEPOINT pc_stmt'); }
  catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT pc_stmt');
    if (isUnique(error)) throw new StoreConflictError(`Valor repetido en ${label}.`);
    throw error;
  }
}

function genericCollection(client: PoolClient, name: CollectionName, table: string): Collection<Row> {
  return {
    async get(id) {
      const result = await client.query<{ data: Row }>(`SELECT data FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      return result.rows[0]?.data;
    },
    async list(filter) {
      const entries = Object.entries(filter ?? {});
      const params: string[] = [];
      const where = entries.map(([key, value]) => { params.push(String(value)); return `${jsonKey(key)} = $${params.length}`; });
      const result = await client.query<{ data: Row }>(`SELECT data FROM ${table}${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, params);
      return result.rows.map(row => row.data);
    },
    async insert(record) { await guarded(client, name, () => client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)`, [record.id, JSON.stringify(record)])); },
    async update(record) {
      let count = 0;
      await guarded(client, name, async () => { count = (await client.query(`UPDATE ${table} SET data=$2::jsonb WHERE id=$1`, [record.id, JSON.stringify(record)])).rowCount ?? 0; });
      if (!count) throw new Error(`El registro ${record.id} de ${name} no existe.`);
    },
    async remove(id) { await client.query(`DELETE FROM ${table} WHERE id=$1`, [id]); },
  };
}

function iso(value: unknown) { return value instanceof Date ? value.toISOString() : String(value); }

// --- Tablas heredadas: app_users / app_sessions / farm_data (se conservan sus columnas) ---
function legacyUsers(client: PoolClient): Collection<UserRecord> {
  const map = (r: { id: string; email: string; password_hash: string; created_at: Date; profile: Record<string, unknown> | null }): UserRecord =>
    ({ id: r.id, email: r.email, passwordHash: r.password_hash, createdAt: iso(r.created_at), ...(r.profile ?? {}) } as UserRecord);
  const profile = (u: UserRecord) => JSON.stringify({ ...(u.displayName ? { displayName: u.displayName } : {}), ...(u.role ? { role: u.role } : {}), ...(u.timeZone ? { timeZone: u.timeZone } : {}), ...(u.contactPhone ? { contactPhone: u.contactPhone } : {}), ...(u.avatarId ? { avatarId: u.avatarId } : {}), ...(u.suspendedAt ? { suspendedAt: u.suspendedAt, suspendedReason: u.suspendedReason ?? '' } : {}), ...(u.demo ? { demo: true } : {}), ...(u.social ? { social: u.social } : {}), ...(u.location ? { location: u.location } : {}) });
  const columns: Record<string, string> = { id: 'id', email: 'email' };
  return {
    async get(id) { if (!UUID.test(id)) return undefined; const r = await client.query(`SELECT * FROM app_users WHERE id=$1 FOR UPDATE`, [id]); return r.rows[0] ? map(r.rows[0]) : undefined; },
    async list(filter) {
      const entries = Object.entries(filter ?? {});
      for (const [key] of entries) if (!columns[key]) throw new Error(`Filtro no admitido en users: ${key}`);
      const where = entries.map(([key], i) => `${columns[key]} = $${i + 1}`);
      const r = await client.query(`SELECT * FROM app_users${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, entries.map(([, value]) => value));
      return r.rows.map(map);
    },
    async insert(u) { await guarded(client, 'users', () => client.query(`INSERT INTO app_users (id,email,password_hash,created_at,profile) VALUES ($1,$2,$3,$4,$5::jsonb)`, [u.id, u.email, u.passwordHash, u.createdAt, profile(u)])); },
    async update(u) {
      let count = 0;
      await guarded(client, 'users', async () => { count = (await client.query(`UPDATE app_users SET email=$2,password_hash=$3,profile=$4::jsonb WHERE id=$1`, [u.id, u.email, u.passwordHash, profile(u)])).rowCount ?? 0; });
      if (!count) throw new Error(`El registro ${u.id} de users no existe.`);
    },
    async remove(id) { if (UUID.test(id)) await client.query(`DELETE FROM app_users WHERE id=$1`, [id]); },
  };
}

function legacySessions(client: PoolClient): Collection<SessionRecord> {
  const map = (r: { token_hash: string; user_id: string; expires_at: Date; created_at: Date }): SessionRecord =>
    ({ id: r.token_hash, userId: r.user_id, expiresAt: iso(r.expires_at), createdAt: iso(r.created_at) });
  const columns: Record<string, string> = { id: 'token_hash', userId: 'user_id' };
  return {
    async get(id) { const r = await client.query(`SELECT * FROM app_sessions WHERE token_hash=$1`, [id]); return r.rows[0] ? map(r.rows[0]) : undefined; },
    async list(filter) {
      const entries = Object.entries(filter ?? {});
      for (const [key] of entries) if (!columns[key]) throw new Error(`Filtro no admitido en sessions: ${key}`);
      const where = entries.map(([key], i) => `${columns[key]} = $${i + 1}`);
      const r = await client.query(`SELECT * FROM app_sessions${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, entries.map(([, value]) => value));
      return r.rows.map(map);
    },
    async insert(s) { await guarded(client, 'sessions', () => client.query(`INSERT INTO app_sessions (token_hash,user_id,expires_at,created_at) VALUES ($1,$2,$3,$4)`, [s.id, s.userId, s.expiresAt, s.createdAt])); },
    async update(s) {
      const r = await client.query(`UPDATE app_sessions SET expires_at=$2 WHERE token_hash=$1`, [s.id, s.expiresAt]);
      if (!r.rowCount) throw new Error(`El registro ${s.id} de sessions no existe.`);
    },
    async remove(id) { await client.query(`DELETE FROM app_sessions WHERE token_hash=$1`, [id]); },
  };
}

function legacyFarms(client: PoolClient): Collection<FarmRecord> {
  const map = (r: { user_id: string; data: Record<string, unknown>; version: string | number; updated_at: Date }): FarmRecord =>
    ({ id: r.user_id, data: r.data, version: Number(r.version), updatedAt: iso(r.updated_at) });
  return {
    async get(id) { if (!UUID.test(id)) return undefined; const r = await client.query(`SELECT * FROM farm_data WHERE user_id=$1 FOR UPDATE`, [id]); return r.rows[0] ? map(r.rows[0]) : undefined; },
    async list(filter) {
      const entries = Object.entries(filter ?? {});
      for (const [key] of entries) if (key !== 'id') throw new Error(`Filtro no admitido en farms: ${key}`);
      const r = await client.query(`SELECT * FROM farm_data${entries.length ? ' WHERE user_id=$1' : ''}`, entries.map(([, value]) => value));
      return r.rows.map(map);
    },
    async insert(f) { await guarded(client, 'farms', () => client.query(`INSERT INTO farm_data (user_id,data,version,updated_at) VALUES ($1,$2::jsonb,$3,$4)`, [f.id, JSON.stringify(f.data), f.version, f.updatedAt])); },
    async update(f) {
      const r = await client.query(`UPDATE farm_data SET data=$2::jsonb,version=$3,updated_at=$4 WHERE user_id=$1`, [f.id, JSON.stringify(f.data), f.version, f.updatedAt]);
      if (!r.rowCount) throw new Error(`El registro ${f.id} de farms no existe.`);
    },
    async remove(id) { if (UUID.test(id)) await client.query(`DELETE FROM farm_data WHERE user_id=$1`, [id]); },
  };
}

// Driver de producción. Sin probar contra un servidor real en esta entrega: la prueba de contrato lo cubre cuando hay PG*.
export class PgStore implements Store {
  readonly driver = 'postgres' as const;
  private readonly pool: Pick<Pool, 'connect'>;
  private ready: Promise<void> | undefined;

  constructor(pool: Pick<Pool, 'connect'>) { this.pool = pool; }

  private ensureSchema() {
    this.ready ??= (async () => {
      const client = await this.pool.connect();
      try { await client.query(generateDdl()); } finally { client.release(); }
    })().catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }

  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const tx = {} as Record<CollectionName, Collection<Row>>;
      for (const spec of COLLECTIONS) {
        if (!SAFE.test(spec.name)) throw new Error('Nombre de colección no válido.');
        tx[spec.name] = (spec.name === 'users' ? legacyUsers(client) : spec.name === 'sessions' ? legacySessions(client) : spec.name === 'farms' ? legacyFarms(client) : genericCollection(client, spec.name, spec.table)) as unknown as Collection<Row>;
      }
      const result = await fn(tx as unknown as Tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { broken = true; /* conexión ya cerrada */ }
      throw error;
    } finally { client.release(broken); }
  }
}

export class PgMediaStore implements MediaStore {
  private readonly pool: Pick<Pool, 'query'>;
  constructor(pool: Pick<Pool, 'query'>) { this.pool = pool; }
  async put(input: { id: string; mime: string; bytes: Uint8Array; ownerId: string }) {
    await this.pool.query(`INSERT INTO pc_media (id,mime,owner_id,bytes) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [input.id, input.mime, input.ownerId, Buffer.from(input.bytes)]);
  }
  async delete(id: string) {
    await this.pool.query(`DELETE FROM pc_media WHERE id=$1`, [id]);
  }
  async get(id: string) {
    const r = await this.pool.query<{ mime: string; bytes: Buffer }>(`SELECT mime, bytes FROM pc_media WHERE id=$1`, [id]);
    return r.rows[0] ? { mime: r.rows[0].mime, bytes: new Uint8Array(r.rows[0].bytes) } : undefined;
  }
}
