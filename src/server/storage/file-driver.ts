import { mkdirSync, statSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { COLLECTIONS } from './specs.ts';
import { StoreConflictError } from './types.ts';
import type { Collection, CollectionName, CollectionSpec, MediaStore, Store, Tx } from './types.ts';

type Row = Record<string, unknown> & { id: string };
type State = Record<string, Record<string, Row>>;

const LOCKS_KEY = Symbol.for('pico-criollo.file-store.locks');
type LockMap = Map<string, Promise<void>>;
function lockMap(): LockMap {
  const holder = globalThis as unknown as Record<symbol, LockMap | undefined>;
  return (holder[LOCKS_KEY] ??= new Map());
}

function matches(row: Row, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function checkUnique(spec: CollectionSpec, rows: Record<string, Row>, candidate: Row) {
  for (const unique of spec.unique) {
    if (unique.where && !matches(candidate, unique.where)) continue;
    for (const other of Object.values(rows)) {
      if (other.id === candidate.id) continue;
      if (unique.where && !matches(other, unique.where)) continue;
      if (unique.fields.every(field => other[field] === candidate[field])) {
        throw new StoreConflictError(`Valor repetido en ${spec.name}: ${unique.fields.join(', ')}.`);
      }
    }
  }
}

// Almacén de desarrollo: un JSON con escritura atómica (temporal + rename).
// Las transacciones se serializan por ruta y trabajan sobre una copia; solo se confirman si terminan bien.
export class FileStore implements Store {
  readonly driver = 'file' as const;
  private readonly path: string;
  private cache: { state: State; mtimeMs: number; size: number } | undefined;

  constructor(path: string) {
    if (process.env.NODE_ENV === 'production' && process.env.STORAGE_ALLOW_FILE !== 'true') {
      throw new Error('El driver de archivo no se permite en producción. Usa STORAGE_DRIVER=postgres.');
    }
    this.path = path;
  }

  private load(): State {
    let stat;
    try { stat = statSync(this.path); } catch { this.cache = undefined; return {}; }
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs && this.cache.size === stat.size) return this.cache.state;
    let state: State;
    try { state = JSON.parse(readFileSync(this.path, 'utf8')) as State; }
    catch { throw new Error(`El archivo de datos ${this.path} está dañado y no se modificó. Restaura una copia o muévelo para empezar de nuevo.`); }
    this.cache = { state, mtimeMs: stat.mtimeMs, size: stat.size };
    return state;
  }

  private async persist(state: State) {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(state), 'utf8');
    let lastError: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await rename(temp, this.path); lastError = undefined; break; }
      catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1))); }
    }
    if (lastError) { await rm(temp, { force: true }); throw lastError; }
    const stat = statSync(this.path);
    this.cache = { state, mtimeMs: stat.mtimeMs, size: stat.size };
  }

  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const locks = lockMap();
    const previous = locks.get(this.path) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    locks.set(this.path, previous.then(() => current));
    await previous;
    try {
      const base = this.load();
      const work = new Map<string, Record<string, Row>>();
      const read = (name: string) => work.get(name) ?? base[name] ?? {};
      const write = (name: string) => {
        let rows = work.get(name);
        if (!rows) { rows = structuredClone(base[name] ?? {}); work.set(name, rows); }
        return rows;
      };
      const tx = {} as Record<CollectionName, Collection<Row>>;
      for (const spec of COLLECTIONS) {
        tx[spec.name] = {
          async get(id) { const row = read(spec.name)[id]; return row ? structuredClone(row) : undefined; },
          async list(filter) {
            const rows = Object.values(read(spec.name));
            return (filter ? rows.filter(row => matches(row, filter as Record<string, unknown>)) : rows).map(row => structuredClone(row));
          },
          async insert(record) {
            const rows = read(spec.name);
            if (rows[record.id]) throw new StoreConflictError(`Ya existe ${spec.name} con id ${record.id}.`);
            checkUnique(spec, rows, record);
            write(spec.name)[record.id] = structuredClone(record);
          },
          async update(record) {
            const rows = read(spec.name);
            if (!rows[record.id]) throw new Error(`El registro ${record.id} de ${spec.name} no existe.`);
            checkUnique(spec, rows, record);
            write(spec.name)[record.id] = structuredClone(record);
          },
          async remove(id) { if (read(spec.name)[id]) delete write(spec.name)[id]; },
        };
      }
      const result = await fn(tx as unknown as Tx);
      if (work.size) await this.persist({ ...base, ...Object.fromEntries(work) });
      return result;
    } finally {
      release();
    }
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
export class FileMediaStore implements MediaStore {
  private readonly dir: string;
  constructor(dir: string) { this.dir = dir; }
  async put(input: { id: string; mime: string; bytes: Uint8Array; ownerId: string }) {
    if (!SAFE_ID.test(input.id)) throw new Error('Identificador de archivo no válido.');
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${input.id}.bin`), input.bytes);
    await writeFile(join(this.dir, `${input.id}.json`), JSON.stringify({ mime: input.mime, ownerId: input.ownerId }), 'utf8');
  }
  async delete(id: string) {
    if (!SAFE_ID.test(id)) return;
    await rm(join(this.dir, `${id}.bin`), { force: true });
    await rm(join(this.dir, `${id}.json`), { force: true });
  }
  async get(id: string) {
    if (!SAFE_ID.test(id)) return undefined;
    try {
      const meta = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')) as { mime: string };
      return { mime: meta.mime, bytes: new Uint8Array(await readFile(join(this.dir, `${id}.bin`))) };
    } catch { return undefined; }
  }
}
