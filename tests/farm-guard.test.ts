import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFarmSave } from '../src/features/market/service/farm-guard.ts';
import { bird, makeEnv } from './helpers/env.ts';

test('al guardar la granja cada ave nueva queda registrada con su propietario', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [bird({ id: 'b1' }), bird({ id: 'b2' })] });
    const rows = await env.store.tx(tx => tx.ownership.list({ ownerId: ana }));
    assert.deepEqual(rows.map(row => row.id).sort(), ['b1', 'b2']);
    assert.equal((await env.store.tx(tx => tx.ownershipHistory.list({ birdId: 'b1' }))).length, 1);
  } finally { await env.cleanup(); }
});

test('un identificador de ave ya registrado a otra cuenta se rechaza (409)', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    await env.saveFarm(ana, { birds: [bird({ id: 'b1' })] });
    await assert.rejects(env.saveFarm(beto, { birds: [bird({ id: 'b1', name: 'Robada' })] }), (error: { status?: number }) => error.status === 409);
    assert.deepEqual((await env.farm(beto)).birds, []);
  } finally { await env.cleanup(); }
});

test('la versión desactualizada se rechaza y no sobrescribe', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [bird({ id: 'b1' })] });
    await assert.rejects(env.store.tx(tx => applyFarmSave(tx, ana, { data: { birds: [] }, version: 1 }, env.now)), (error: { status?: number }) => error.status === 409);
  } finally { await env.cleanup(); }
});

test('un ave con bloqueo activo no puede venderse, morir ni eliminarse desde la granja', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [bird({ id: 'b1', name: 'Luna' })] });
    await env.store.tx(tx => tx.locks.insert({ id: 'l1', birdId: 'b1', listingId: 'x', status: 'active', createdAt: env.now.toISOString() }));
    for (const status of ['Vendido', 'Fallecido']) {
      await assert.rejects(env.saveFarm(ana, { birds: [bird({ id: 'b1', name: 'Luna', status })] }), (error: { status?: number; message?: string }) => error.status === 409 && /mercado/.test(error.message ?? ''));
    }
    await assert.rejects(env.saveFarm(ana, { birds: [] }), (error: { status?: number }) => error.status === 409);
    await env.saveFarm(ana, { birds: [bird({ id: 'b1', name: 'Luna', notes: 'editar notas sí se permite' })] });
  } finally { await env.cleanup(); }
});

test('el cliente no puede fijar el estado Transferido ni alterar una lápida', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [bird({ id: 'b1' })] });
    await assert.rejects(env.saveFarm(ana, { birds: [bird({ id: 'b1', status: 'Transferido' })] }), (error: { status?: number }) => error.status === 409);
    // Simula la lápida que escribe el servidor al transferir
    await env.store.tx(async tx => {
      const farm = (await tx.farms.get(ana))!;
      await tx.farms.update({ ...farm, version: farm.version + 1, data: { ...farm.data, birds: [bird({ id: 'b1', status: 'Transferido' })] } });
      await tx.ownership.update({ id: 'b1', ownerId: 'otro-dueño', since: env.now.toISOString(), version: 2 });
    });
    await assert.rejects(env.saveFarm(ana, { birds: [bird({ id: 'b1', status: 'Activo' })] }), (error: { status?: number }) => error.status === 409);
    await assert.rejects(env.saveFarm(ana, { birds: [] }), (error: { status?: number }) => error.status === 409);
    await env.saveFarm(ana, { birds: [bird({ id: 'b1', status: 'Transferido' }), bird({ id: 'b2' })] });
  } finally { await env.cleanup(); }
});

test('identificadores duplicados o vacíos en la misma granja son inválidos', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await assert.rejects(env.saveFarm(ana, { birds: [bird({ id: 'b1' }), bird({ id: 'b1' })] }), (error: { status?: number }) => error.status === 400);
    await assert.rejects(env.saveFarm(ana, { birds: [bird({ id: '' })] }), (error: { status?: number }) => error.status === 400);
  } finally { await env.cleanup(); }
});
