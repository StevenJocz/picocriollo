import { ForbiddenError } from './errors.ts';
import type { Tx, UserRecord } from './storage/types.ts';

/** Una cuenta con restricciones no puede publicar, ofertar, solicitar compras ni escribir en el mercado. */
export async function assertActive(tx: Tx, userId: string): Promise<void> {
  const user = await tx.users.get(userId);
  if (user?.suspendedAt) throw new ForbiddenError('Tu cuenta tiene restricciones comerciales. Contacta a un moderador.');
}

export async function requireStaff(tx: Tx, userId: string): Promise<UserRecord> {
  const user = await tx.users.get(userId);
  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) throw new ForbiddenError('Esta acción es solo para moderadores.');
  return user;
}

export async function staffIds(tx: Tx): Promise<string[]> {
  return [...(await tx.users.list({ role: 'moderator' })), ...(await tx.users.list({ role: 'admin' }))].map(user => user.id);
}
