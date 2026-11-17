import { COLLECTIONS } from './specs.ts';
import type { CollectionSpec } from './types.ts';

// Tablas que ya existían antes del mercado: se conservan tal cual (solo se añade app_users.profile).
export const LEGACY_TABLES = new Set(['app_users', 'app_sessions', 'farm_data']);
const SAFE = /^[A-Za-z][A-Za-z0-9]*$/;

export function jsonKey(field: string) {
  if (!SAFE.test(field)) throw new Error(`Campo no válido: ${field}`);
  return `(data->>'${field}')`;
}

function indexName(table: string, kind: string, fields: string[]) {
  return `${table}_${fields.join('_').toLowerCase()}_${kind}`.slice(0, 63);
}

export function collectionDdl(spec: CollectionSpec): string[] {
  const lines: string[] = [];
  // Las tablas heredadas tienen columnas reales (no `data`): sus índices viven en LEGACY_DDL.
  if (LEGACY_TABLES.has(spec.table)) return lines;
  lines.push(`CREATE TABLE IF NOT EXISTS ${spec.table} (\n  id text PRIMARY KEY,\n  data jsonb NOT NULL\n);`);
  for (const field of spec.index) lines.push(`CREATE INDEX IF NOT EXISTS ${indexName(spec.table, 'idx', [field])} ON ${spec.table} (${jsonKey(field)});`);
  for (const unique of spec.unique) {
    if (LEGACY_TABLES.has(spec.table) && spec.name === 'users') continue; // app_users.email ya es UNIQUE
    const columns = unique.fields.map(jsonKey).join(', ');
    let where = '';
    if (unique.where) {
      where = ' WHERE ' + Object.entries(unique.where).map(([key, value]) => `${jsonKey(key)} = '${String(value).replace(/'/g, "''")}'`).join(' AND ');
    }
    lines.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName(spec.table, 'uq', unique.fields)} ON ${spec.table} (${columns})${where};`);
  }
  return lines;
}

const LEGACY_DDL = `CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS farm_data (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pc_media (
  id text PRIMARY KEY,
  mime text NOT NULL,
  owner_id text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);`;

export function generateDdl(): string {
  const body = COLLECTIONS.flatMap(collectionDdl).join('\n');
  return `-- Generado por scripts/gen-migration.ts desde src/server/storage/specs.ts. No editar a mano.\n-- Cada colección nueva es una tabla (id, data jsonb) con índices y únicos sobre campos clave.\n\n${LEGACY_DDL}\n\n${body}\n`;
}
