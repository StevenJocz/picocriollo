import assert from 'node:assert/strict';
import test from 'node:test';
import { PgStore } from '../src/server/storage/pg-driver.ts';

// Regresión: con menos de 20 cuentas reales la app sincroniza las cuentas de muestra y consulta ids antiguos
// («demo-social-roble»). En PostgreSQL esas columnas son uuid y la consulta fallaba con 22P02, dando 503 al registrarse.
function fakePool() {
  const queries: { text: string; values?: unknown[] }[] = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      if (values?.some(value => typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value) && /\b(app_users|farm_data)\b/.test(text))) {
        throw Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' });
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { pool: { connect: async () => client } as never, queries };
}

test('los ids que no son uuid no llegan a las tablas con columna uuid', async () => {
  const { pool, queries } = fakePool();
  const store = new PgStore(pool);
  await store.tx(async tx => {
    assert.equal(await tx.users.get('demo-social-roble'), undefined);
    assert.equal(await tx.farms.get('demo-social-roble'), undefined);
    await tx.users.remove('demo-social-roble');
    await tx.farms.remove('demo-social-roble');
  });
  assert.equal(queries.some(q => q.values?.includes('demo-social-roble')), false);
});

test('un uuid válido sí se consulta', async () => {
  const { pool, queries } = fakePool();
  const id = '00000000-0000-4000-8000-00000000d001';
  await new PgStore(pool).tx(async tx => { await tx.users.get(id); });
  assert.equal(queries.some(q => q.values?.includes(id)), true);
});
