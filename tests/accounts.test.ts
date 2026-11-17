import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUsernameFree, createAccount, usernameKey, validateUsername } from '../src/server/accounts.ts';
import { aliasOf } from '../src/features/market/service/snapshot.ts';
import { StoreConflictError } from '../src/server/storage/types.ts';
import { makeEnv } from './helpers/env.ts';
import { status } from './helpers/market.ts';

test('el nombre de usuario se limpia y se valida', () => {
  assert.equal(validateUsername('  Ana   María  '), 'Ana María');
  assert.equal(validateUsername('Granja_El-Pico.2'), 'Granja_El-Pico.2');
  for (const bad of [undefined, null, 42, '', '   ', 'a', 'x'.repeat(41), 'ana@correo.com', 'visita www.sitio.co', 'https://x.co', '<b>ana</b>', 'ana\nbeto', 'ana\u0000']) {
    assert.throws(() => validateUsername(bad), status(400), `debía rechazar ${JSON.stringify(bad)}`);
  }
});

test('la clave de comparación ignora mayúsculas, tildes y espacios repetidos', () => {
  assert.equal(usernameKey('José  PÉREZ'), usernameKey('jose perez'));
  assert.notEqual(usernameKey('Jose Perez'), usernameKey('Jose Perea'));
});

test('crear una cuenta guarda usuario y granja y el nombre es el alias público', async () => {
  const env = await makeEnv();
  try {
    const user = await createAccount(env.store, { email: 'ana@correo.test', passwordHash: 'hash', username: 'Ana María', now: env.now });
    assert.equal(user.displayName, 'Ana María');
    assert.equal(aliasOf(user), 'Ana María');
    assert.ok(await env.store.tx(tx => tx.farms.get(user.id)));
  } finally { await env.cleanup(); }
});

test('un nombre de usuario no se repite aunque cambien mayúsculas, tildes o espacios', async () => {
  const env = await makeEnv();
  try {
    await createAccount(env.store, { email: 'a@correo.test', passwordHash: 'h', username: 'Ana María', now: env.now });
    for (const dup of ['ana maría', 'ANA  MARIA', 'Ana Maria']) {
      await assert.rejects(createAccount(env.store, { email: `${Math.random()}@correo.test`, passwordHash: 'h', username: dup, now: env.now }), status(409), dup);
    }
    // una cuenta rechazada no deja usuario ni granja a medias
    assert.equal((await env.store.tx(tx => tx.users.list())).filter(user => !user.demo).length, 1);
    assert.equal((await env.store.tx(tx => tx.farms.list())).length, 1);
    await createAccount(env.store, { email: 'b@correo.test', passwordHash: 'h', username: 'Ana Marta', now: env.now });
  } finally { await env.cleanup(); }
});

test('un correo repetido sigue siendo conflicto y no consume el nombre de usuario', async () => {
  const env = await makeEnv();
  try {
    await createAccount(env.store, { email: 'a@correo.test', passwordHash: 'h', username: 'Ana', now: env.now });
    await assert.rejects(createAccount(env.store, { email: 'a@correo.test', passwordHash: 'h', username: 'Beto', now: env.now }), StoreConflictError);
    await createAccount(env.store, { email: 'b@correo.test', passwordHash: 'h', username: 'Beto', now: env.now });
  } finally { await env.cleanup(); }
});

test('al cambiar el nombre desde el perfil, el propio nombre no cuenta como repetido', async () => {
  const env = await makeEnv();
  try {
    const ana = await createAccount(env.store, { email: 'a@correo.test', passwordHash: 'h', username: 'Ana', now: env.now });
    await createAccount(env.store, { email: 'b@correo.test', passwordHash: 'h', username: 'Beto', now: env.now });
    await env.store.tx(async tx => { await assertUsernameFree(tx, 'ana', ana.id); });
    await assert.rejects(env.store.tx(tx => assertUsernameFree(tx, 'BETO', ana.id)), status(409));
  } finally { await env.cleanup(); }
});
