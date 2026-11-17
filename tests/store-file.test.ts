import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileStore, FileMediaStore } from '../src/server/storage/file-driver.ts';
import { storeContract, ID } from './helpers/store-contract.ts';

async function makeHarness() {
  const dir = await mkdtemp(join(tmpdir(), 'pico-store-'));
  const path = join(dir, 'pico.json');
  return { dir, path, store: new FileStore(path), reopen: async () => new FileStore(path), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

storeContract('FileStore', makeHarness);

test('FileStore: los datos persisten al reabrir el archivo', async () => {
  const h = await makeHarness();
  try {
    await h.store.tx(tx => tx.users.insert({ id: ID(1), email: 'a@x.co', passwordHash: 'x', createdAt: '' }));
    const again = await h.reopen();
    assert.equal((await again.tx(tx => tx.users.get(ID(1))))?.email, 'a@x.co');
  } finally { await h.cleanup(); }
});

test('FileStore: dos instancias sobre el mismo archivo ven los cambios de la otra', async () => {
  const h = await makeHarness();
  try {
    const other = new FileStore(h.path);
    await h.store.tx(tx => tx.users.insert({ id: ID(1), email: 'a@x.co', passwordHash: 'x', createdAt: '' }));
    assert.ok(await other.tx(tx => tx.users.get(ID(1))));
    await other.tx(tx => tx.users.insert({ id: ID(2), email: 'b@x.co', passwordHash: 'x', createdAt: '' }));
    assert.equal((await h.store.tx(tx => tx.users.list())).length, 2);
  } finally { await h.cleanup(); }
});

test('FileStore: un archivo dañado produce un error claro y no se sobrescribe', async () => {
  const h = await makeHarness();
  try {
    await writeFile(h.path, '{ esto no es json', 'utf8');
    await assert.rejects(h.store.tx(tx => tx.users.list()), /dañado/);
    await assert.rejects(h.store.tx(tx => tx.users.insert({ id: ID(1), email: 'a@x.co', passwordHash: 'x', createdAt: '' })), /dañado/);
    assert.equal(await readFile(h.path, 'utf8'), '{ esto no es json');
  } finally { await h.cleanup(); }
});

test('FileStore: no deja archivos temporales tras confirmar', async () => {
  const h = await makeHarness();
  try {
    await h.store.tx(tx => tx.users.insert({ id: ID(1), email: 'a@x.co', passwordHash: 'x', createdAt: '' }));
    assert.deepEqual((await readdir(h.dir)).filter(name => name.includes('.tmp')), []);
  } finally { await h.cleanup(); }
});

test('FileStore: se rechaza en producción', async () => {
  const env = process.env as Record<string, string | undefined>;
  const original = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try { assert.throws(() => new FileStore('/tmp/x.json'), /producción/); }
  finally { env.NODE_ENV = original; }
});

test('FileMediaStore: guarda y recupera bytes con su tipo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pico-media-'));
  try {
    const media = new FileMediaStore(dir);
    await media.put({ id: 'm1', mime: 'image/png', bytes: Uint8Array.from([1, 2, 3]), ownerId: 'u1' });
    const got = await media.get('m1');
    assert.equal(got?.mime, 'image/png');
    assert.deepEqual([...got!.bytes], [1, 2, 3]);
    assert.equal(await media.get('../escape'), undefined);
    assert.equal(await media.get('inexistente'), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
