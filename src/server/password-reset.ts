import { createHash, randomBytes } from 'node:crypto';
import { ValidationError } from './errors.ts';
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN } from './password.ts';
import type { Store } from './storage/types.ts';

// Restablecer la contraseña olvidada. Sin imports de Next: se prueba con node --test.
// El token en claro solo viaja por correo; en la base queda su hash y vence a los 30 minutos o al usarse.
export const RESET_TTL_MS = 30 * 60_000;
/** Si ya se envió un enlace hace menos de esto, no se genera otro (frena el correo masivo a una cuenta). */
export const RESET_COOLDOWN_MS = 60_000;
export const RESET_INVALID = 'El enlace no es válido o ya venció. Pide uno nuevo.';

const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

/** Crea un enlace para el correo. Devuelve null (sin revelar nada) si la cuenta no existe, es de muestra o está en espera. */
export async function requestPasswordReset(store: Store, email: string, now: Date = new Date()): Promise<{ token: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  return store.tx(async tx => {
    const user = (await tx.users.list({ email: normalized }))[0];
    if (!user || user.demo || user.suspendedAt) return null;
    const previous = await tx.passwordResets.list({ userId: user.id });
    if (previous.some(row => now.getTime() - new Date(row.createdAt).getTime() < RESET_COOLDOWN_MS)) return null;
    for (const row of previous) await tx.passwordResets.remove(row.id);
    const token = randomBytes(32).toString('base64url');
    await tx.passwordResets.insert({ id: tokenId(token), userId: user.id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + RESET_TTL_MS).toISOString() });
    return { token, email: user.email };
  });
}

export function validateNewPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new ValidationError(`La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`);
  return password;
}

/** ¿El enlace sirve todavía? Lo usa la pantalla para avisar antes de pedir la contraseña nueva. */
export async function checkPasswordResetToken(store: Store, token: unknown, now: Date = new Date()): Promise<boolean> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return false;
  const row = await store.tx(tx => tx.passwordResets.get(tokenId(token)));
  return Boolean(row && new Date(row.expiresAt).getTime() > now.getTime());
}

/** Cambia la contraseña con un enlace válido. Cierra todas las sesiones de la cuenta y anula los demás enlaces. */
export async function resetPassword(store: Store, token: unknown, password: unknown, now: Date = new Date()): Promise<{ userId: string }> {
  const next = validateNewPassword(password);
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ValidationError(RESET_INVALID);
  const passwordHash = await hashPassword(next);
  return store.tx(async tx => {
    const row = await tx.passwordResets.get(tokenId(token));
    if (!row || new Date(row.expiresAt).getTime() <= now.getTime()) throw new ValidationError(RESET_INVALID);
    const user = await tx.users.get(row.userId);
    if (!user || user.suspendedAt) throw new ValidationError(RESET_INVALID);
    await tx.users.update({ ...user, passwordHash });
    for (const reset of await tx.passwordResets.list({ userId: user.id })) await tx.passwordResets.remove(reset.id);
    for (const session of await tx.sessions.list({ userId: user.id })) await tx.sessions.remove(session.id);
    return { userId: user.id };
  });
}
