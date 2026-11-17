import { randomUUID } from 'node:crypto';
import { ConflictError, ValidationError } from './errors.ts';
import { emptyFarmData } from './farm-template.ts';
import { createOnboardingSample, removeOnboardingSample } from './demo-content.ts';
import { SOCIAL_SAMPLE_REAL_USER_LIMIT, syncDemoCommunityIn } from './demo-community.ts';
import type { Store, Tx, UserRecord } from './storage/types.ts';

// Alta de cuentas y nombre de usuario. Sin imports de Next: se prueba con node --test.

export const USERNAME_MIN = 2, USERNAME_MAX = 40;
export const ONBOARDING_SAMPLE_ACCOUNT_LIMIT = SOCIAL_SAMPLE_REAL_USER_LIMIT;

/** Limpia y valida el nombre de usuario (el nombre público que ven los demás en el mercado y en los chats). */
export function validateUsername(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Escribe un nombre de usuario.');
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new ValidationError('El nombre de usuario no puede tener saltos de línea ni caracteres de control.');
  const name = raw.normalize('NFC').replace(/ +/g, ' ').trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) throw new ValidationError(`El nombre de usuario debe tener entre ${USERNAME_MIN} y ${USERNAME_MAX} caracteres.`);
  if (/[@<>]|https?:|www\./i.test(name)) throw new ValidationError('El nombre de usuario no puede parecerse a un correo ni incluir enlaces o símbolos como @ < >.');
  return name;
}

/** Clave de comparación: ignora mayúsculas, tildes y espacios repetidos (evita suplantaciones como «José» y «Jose»). */
export const usernameKey = (name: string): string => name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-CO');

export async function assertUsernameFree(tx: Tx, name: string, exceptUserId?: string): Promise<void> {
  const key = usernameKey(name);
  for (const user of await tx.users.list()) {
    if (user.id !== exceptUserId && user.displayName && usernameKey(user.displayName) === key) throw new ConflictError('Ese nombre de usuario ya está en uso. Elige otro.');
  }
}

export interface NewAccount { email: string; passwordHash: string; username: string; /** Ciudad y departamento elegidos al crear la cuenta. */ location?: { city: string; region?: string }; now?: Date; }

/** Crea el usuario y su granja en una sola transacción. Correo repetido: StoreConflictError; nombre repetido: ConflictError. */
export async function createAccount(store: Store, input: NewAccount): Promise<UserRecord> {
  const username = validateUsername(input.username);
  const at = (input.now ?? new Date()).toISOString(), id = randomUUID();
  const user: UserRecord = { id, email: input.email.trim().toLowerCase(), passwordHash: input.passwordHash, createdAt: at, displayName: username, ...(input.location ? { location: input.location } : {}) };
  await store.tx(async tx => {
    await assertUsernameFree(tx, username);
    await tx.users.insert(user);
    const registeredUsers = await tx.users.list();
    const realUserCount = registeredUsers.filter(account => !account.demo).length;
    const data = realUserCount >= ONBOARDING_SAMPLE_ACCOUNT_LIMIT ? emptyFarmData() : createOnboardingSample(id, at);
    if (realUserCount >= ONBOARDING_SAMPLE_ACCOUNT_LIMIT) {
      await syncDemoCommunityIn(tx, input.now ?? new Date(at), realUserCount);
      for (const farm of await tx.farms.list()) {
        const cleaned = removeOnboardingSample(farm.data);
        if (!('demoContent' in farm.data)) continue;
        const marker = farm.data.demoContent as { idsByCollection?: Record<string, string[]> };
        for (const birdId of marker.idsByCollection?.birds ?? []) {
          const ownership = await tx.ownership.get(birdId);
          if (ownership?.ownerId === farm.id) await tx.ownership.remove(birdId);
          for (const history of await tx.ownershipHistory.list({ birdId })) await tx.ownershipHistory.remove(history.id);
        }
        await tx.farms.update({ ...farm, data: cleaned, version: farm.version + 1, updatedAt: at });
      }
    } else await syncDemoCommunityIn(tx, input.now ?? new Date(at), realUserCount);
    await tx.farms.insert({ id, data, version: 1, updatedAt: at });
  });
  return user;
}
