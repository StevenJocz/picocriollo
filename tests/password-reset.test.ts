import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../src/server/password.ts';
import { checkPasswordResetToken, requestPasswordReset, resetPassword, RESET_COOLDOWN_MS, RESET_TTL_MS } from '../src/server/password-reset.ts';
import { resetEmail, resetLink, sendResetEmail } from '../src/server/reset-mail.ts';
import { makeEnv } from './helpers/env.ts';
import { status } from './helpers/market.ts';

const NUEVA = 'una-clave-nueva-larga';

async function conCuenta(name = 'Ana') {
  const env = await makeEnv();
  const id = await env.addUser(name, { passwordHash: await hashPassword('la-clave-vieja-larga') });
  return { env, id, email: `${name.toLowerCase()}@correo.test` };
}

test('la contraseña se verifica contra su hash y rechaza otra', async () => {
  const hash = await hashPassword('la-clave-vieja-larga');
  assert.equal(await verifyPassword('la-clave-vieja-larga', hash), true);
  assert.equal(await verifyPassword('otra-clave-distinta', hash), false);
  assert.equal(await verifyPassword('x', 'no-es-un-hash'), false);
});

test('pedir el enlace guarda solo el hash del token y vence a los 30 minutos', async () => {
  const { env, id, email } = await conCuenta();
  try {
    const found = await requestPasswordReset(env.store, ` ${email.toUpperCase()} `, env.now);
    assert.ok(found && found.token.length >= 40);
    const rows = await env.store.tx(tx => tx.passwordResets.list());
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].id, found.token, 'el token en claro no se guarda');
    assert.equal(rows[0].userId, id);
    assert.equal(new Date(rows[0].expiresAt).getTime() - env.now.getTime(), RESET_TTL_MS);
    assert.equal(await checkPasswordResetToken(env.store, found.token, env.now), true);
    assert.equal(await checkPasswordResetToken(env.store, found.token, new Date(env.now.getTime() + RESET_TTL_MS + 1)), false);
    assert.equal(await checkPasswordResetToken(env.store, 'x'.repeat(40), env.now), false);
  } finally { await env.cleanup(); }
});

test('un correo sin cuenta, de muestra o en espera no genera enlace ni lo revela', async () => {
  const { env } = await conCuenta();
  try {
    assert.equal(await requestPasswordReset(env.store, 'nadie@correo.test', env.now), null);
    await env.addUser('Muestra', { demo: true });
    assert.equal(await requestPasswordReset(env.store, 'muestra@correo.test', env.now), null);
    await env.addUser('Pausada', { suspendedAt: env.now.toISOString() });
    assert.equal(await requestPasswordReset(env.store, 'pausada@correo.test', env.now), null);
    assert.equal((await env.store.tx(tx => tx.passwordResets.list())).length, 0);
  } finally { await env.cleanup(); }
});

test('no se generan enlaces seguidos y uno nuevo anula el anterior', async () => {
  const { env, email } = await conCuenta();
  try {
    const first = await requestPasswordReset(env.store, email, env.now);
    assert.ok(first);
    assert.equal(await requestPasswordReset(env.store, email, new Date(env.now.getTime() + RESET_COOLDOWN_MS - 1)), null);
    const later = new Date(env.now.getTime() + RESET_COOLDOWN_MS + 1);
    const second = await requestPasswordReset(env.store, email, later);
    assert.ok(second && second.token !== first.token);
    assert.equal(await checkPasswordResetToken(env.store, first.token, later), false);
    assert.equal(await checkPasswordResetToken(env.store, second.token, later), true);
  } finally { await env.cleanup(); }
});

test('restablecer cambia la contraseña, gasta el enlace y cierra las sesiones', async () => {
  const { env, id, email } = await conCuenta();
  try {
    await env.store.tx(tx => tx.sessions.insert({ id: 'sesion-1', userId: id, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: env.now.toISOString() }));
    const found = await requestPasswordReset(env.store, email, env.now);
    assert.ok(found);
    await resetPassword(env.store, found.token, NUEVA, env.now);
    const user = await env.store.tx(tx => tx.users.get(id));
    assert.equal(await verifyPassword(NUEVA, user!.passwordHash), true);
    assert.equal(await verifyPassword('la-clave-vieja-larga', user!.passwordHash), false);
    assert.equal((await env.store.tx(tx => tx.sessions.list({ userId: id }))).length, 0);
    await assert.rejects(resetPassword(env.store, found.token, NUEVA, env.now), status(400), 'el enlace sirve una sola vez');
  } finally { await env.cleanup(); }
});

test('restablecer rechaza enlaces vencidos o falsos y contraseñas fuera de rango', async () => {
  const { env, id, email } = await conCuenta();
  try {
    const found = await requestPasswordReset(env.store, email, env.now);
    assert.ok(found);
    await assert.rejects(resetPassword(env.store, found.token, NUEVA, new Date(env.now.getTime() + RESET_TTL_MS + 1)), status(400));
    await assert.rejects(resetPassword(env.store, 'a'.repeat(43), NUEVA, env.now), status(400));
    await assert.rejects(resetPassword(env.store, undefined, NUEVA, env.now), status(400));
    for (const bad of [undefined, 42, 'corta', 'x'.repeat(129)]) await assert.rejects(resetPassword(env.store, found.token, bad, env.now), status(400), String(bad));
    const user = await env.store.tx(tx => tx.users.get(id));
    assert.equal(await verifyPassword('la-clave-vieja-larga', user!.passwordHash), true, 'la contraseña no cambió');
    assert.equal(await checkPasswordResetToken(env.store, found.token, env.now), true, 'un intento fallido no gasta el enlace');
  } finally { await env.cleanup(); }
});

test('el enlace del correo sale de APP_ORIGIN y nunca de la petición', () => {
  assert.equal(resetLink('abc', { APP_ORIGIN: 'https://app.ejemplo.co/' }), 'https://app.ejemplo.co/restablecer?token=abc');
  assert.equal(resetLink('abc', { NODE_ENV: 'production' }), undefined);
  assert.equal(resetLink('a b', {}), 'http://localhost:3000/restablecer?token=a%20b');
  const mail = resetEmail('https://app.ejemplo.co/restablecer?token=abc');
  assert.match(mail.text, /30 minutos/);
  assert.match(mail.html, /href="https:\/\/app\.ejemplo\.co\/restablecer\?token=abc"/);
});

test('sin SMTP el enlace queda en el registro; con SMTP se envía al correo de la cuenta', async () => {
  const logged: string[] = [];
  assert.equal(await sendResetEmail('ana@correo.test', 'tok', { env: { APP_ORIGIN: 'https://app.ejemplo.co' }, log: message => logged.push(message) }), 'logged');
  assert.match(logged[0], /https:\/\/app\.ejemplo\.co\/restablecer\?token=tok/);
  assert.equal(await sendResetEmail('ana@correo.test', 'tok', { env: { NODE_ENV: 'production' }, log: message => logged.push(message) }), 'skipped');

  const sent: Record<string, unknown>[] = [];
  const mailer = { async sendMail(message: Record<string, unknown>) { sent.push(message); } };
  assert.equal(await sendResetEmail('ana@correo.test', 'tok', { env: { APP_ORIGIN: 'https://app.ejemplo.co', SMTP_FROM: 'Pico <avisos@ejemplo.co>' }, mailer }), 'sent');
  assert.equal(sent[0].to, 'ana@correo.test');
  assert.equal(sent[0].from, 'Pico <avisos@ejemplo.co>');
  assert.match(String(sent[0].text), /restablecer\?token=tok/);
});
