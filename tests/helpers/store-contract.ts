import assert from 'node:assert/strict';
import test from 'node:test';
import { StoreConflictError } from '../../src/server/storage/types.ts';
import type { Store, UserRecord, BirdLockRecord } from '../../src/server/storage/types.ts';

export interface StoreHarness { store: Store; reopen?: () => Promise<Store>; cleanup: () => Promise<void>; }

export const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = (id: string, email: string): UserRecord => ({ id, email, passwordHash: 'x', createdAt: '2026-10-14T00:00:00.000Z' });
const lock = (id: string, birdId: string, status: 'active' | 'released'): BirdLockRecord => ({ id, birdId, status, createdAt: '2026-10-14T00:00:00.000Z' });

export function storeContract(label: string, make: () => Promise<StoreHarness>, options: { skip?: string } = {}) {
  const t = (name: string, fn: (harness: StoreHarness) => Promise<void>) => test(`${label}: ${name}`, { skip: options.skip }, async () => {
    const harness = await make();
    try { await fn(harness); } finally { await harness.cleanup(); }
  });

  t('inserta, consulta, lista, actualiza y elimina', async ({ store }) => {
    await store.tx(async tx => { await tx.users.insert(user(ID(1), 'a@x.co')); await tx.users.insert(user(ID(2), 'b@x.co')); });
    await store.tx(async tx => {
      assert.equal((await tx.users.get(ID(1)))?.email, 'a@x.co');
      assert.equal((await tx.users.get(ID(99))), undefined);
      assert.equal((await tx.users.list()).length, 2);
      assert.deepEqual((await tx.users.list({ email: 'b@x.co' })).map(row => row.id), [ID(2)]);
      await tx.users.update({ ...user(ID(1), 'a@x.co'), displayName: 'Ana' });
      await tx.users.remove(ID(2));
    });
    await store.tx(async tx => {
      assert.equal((await tx.users.get(ID(1)))?.displayName, 'Ana');
      assert.equal(await tx.users.get(ID(2)), undefined);
    });
  });

  t('rechaza id duplicado y valores únicos repetidos', async ({ store }) => {
    await store.tx(tx => tx.users.insert(user(ID(1), 'a@x.co')));
    await assert.rejects(store.tx(tx => tx.users.insert(user(ID(1), 'otro@x.co'))), StoreConflictError);
    await assert.rejects(store.tx(tx => tx.users.insert(user(ID(9), 'a@x.co'))), StoreConflictError);
    await assert.rejects(store.tx(tx => tx.users.update({ id: ID(99), email: 'z@x.co', passwordHash: 'x', createdAt: '' })), /no existe/i);
  });

  t('actualizar a un correo ya usado también es conflicto', async ({ store }) => {
    await store.tx(async tx => { await tx.users.insert(user(ID(1), 'a@x.co')); await tx.users.insert(user(ID(2), 'b@x.co')); });
    await assert.rejects(store.tx(tx => tx.users.update(user(ID(2), 'a@x.co'))), StoreConflictError);
  });

  t('el único parcial permite un solo bloqueo activo por ave', async ({ store }) => {
    await store.tx(tx => tx.locks.insert(lock('l1', 'bird-1', 'active')));
    await assert.rejects(store.tx(tx => tx.locks.insert(lock('l2', 'bird-1', 'active'))), StoreConflictError);
    await store.tx(tx => tx.locks.update(lock('l1', 'bird-1', 'released')));
    await store.tx(tx => tx.locks.insert(lock('l2', 'bird-1', 'active')));
    await store.tx(tx => tx.locks.insert(lock('l3', 'bird-2', 'active')));
    const active = await store.tx(tx => tx.locks.list({ status: 'active' }));
    assert.equal(active.length, 2);
  });

  t('una excepción revierte todos los cambios de la transacción', async ({ store }) => {
    await store.tx(tx => tx.users.insert(user(ID(1), 'a@x.co')));
    await assert.rejects(store.tx(async tx => {
      await tx.users.insert(user(ID(2), 'b@x.co'));
      await tx.users.remove(ID(1));
      throw new Error('falla de negocio');
    }), /falla de negocio/);
    await store.tx(async tx => {
      assert.ok(await tx.users.get(ID(1)));
      assert.equal(await tx.users.get(ID(2)), undefined);
    });
  });

  t('los objetos devueltos no alteran el almacén', async ({ store }) => {
    await store.tx(tx => tx.users.insert(user(ID(1), 'a@x.co')));
    await store.tx(async tx => { const row = await tx.users.get(ID(1)); row!.email = 'mutado@x.co'; });
    await store.tx(async tx => assert.equal((await tx.users.get(ID(1)))?.email, 'a@x.co'));
  });

  t('transacciones simultáneas se serializan sin perder escrituras', async ({ store }) => {
    await store.tx(async tx => { await tx.users.insert(user(ID(1), 'a@x.co')); await tx.farms.insert({ id: ID(1), data: { n: 0 }, version: 1, updatedAt: '2026-10-14T00:00:00.000Z' }); });
    await Promise.all(Array.from({ length: 12 }, () => store.tx(async tx => {
      const row = (await tx.farms.get(ID(1)))!;
      await tx.farms.update({ ...row, data: { n: Number(row.data.n) + 1 }, version: row.version + 1 });
    })));
    const row = await store.tx(tx => tx.farms.get(ID(1)));
    assert.equal(row?.data.n, 12);
    assert.equal(row?.version, 13);
  });
}
