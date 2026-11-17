import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

// Contraseñas con scrypt. Sin imports de Next: se prueba con node --test.
export const PASSWORD_MIN = 12, PASSWORD_MAX = 128;
const params = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function derive(password: string, salt: Buffer) {
  return await new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, params, (error, key) => error ? reject(error) : resolve(key as Buffer)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16), hash = await derive(password, salt);
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[5], 'base64url'), actual = await derive(password, Buffer.from(parts[4], 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Gasta el mismo tiempo que una verificación real: así no se nota si el correo existe. */
export async function burnPasswordTime(password: string): Promise<void> { await derive(password, Buffer.alloc(16)); }
