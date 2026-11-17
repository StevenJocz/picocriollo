import { normalizeLocation } from '../features/profile/service/location.ts';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAccount, validateUsername } from './accounts.ts';
import { burnPasswordTime, hashPassword, verifyPassword } from './password.ts';
import { getStore } from './storage/index.ts';
import type { Role } from './storage/types.ts';

const COOKIE = 'pico_session';
const SESSION_DAYS = 14;
export type SessionUser = { id: string; email: string; displayName?: string; avatarUrl?: string; role?: Role };

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
const publicUser = (u: { id: string; email: string; displayName?: string; avatarId?: string; role?: Role }): SessionUser => ({ id: u.id, email: u.email, ...(u.displayName ? { displayName: u.displayName } : {}), ...(u.avatarId ? { avatarUrl: `/api/media/${u.avatarId}` } : {}), ...(u.role ? { role: u.role } : {}) });

async function issueSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date(), expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await getStore().tx(tx => tx.sessions.insert({ id: tokenHash(token), userId, expiresAt: expiresAt.toISOString(), createdAt: now.toISOString() }));
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', expires:expiresAt });
}

/** El nombre de usuario es obligatorio y único. Correo repetido: StoreConflictError; nombre repetido o inválido: ConflictError / ValidationError. */
export async function registerUser(email: string, password: string, username: unknown, place: { city?: unknown; region?: unknown } = {}): Promise<SessionUser> {
  const name = validateUsername(username);
  // La ciudad es opcional para quien llama a la API, pero si viene se valida antes de crear nada.
  const location = typeof place.city === 'string' && place.city.trim() ? normalizeLocation(place) : undefined;
  const user = await createAccount(getStore(), { email, passwordHash: await hashPassword(password), username: name, ...(location ? { location } : {}) });
  await issueSession(user.id);
  return publicUser(user);
}

export async function loginUser(email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const row = (await getStore().tx(tx => tx.users.list({ email: normalized })))[0];
  if (!row) { await burnPasswordTime(password); return null; }
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  await issueSession(row.id);
  return publicUser(row);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return getStore().tx(async tx => {
    const session = await tx.sessions.get(tokenHash(token));
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
    const user = await tx.users.get(session.userId);
    return user ? publicUser(user) : null;
  });
}

export async function logoutUser() {
  const jar = await cookies(), token = jar.get(COOKIE)?.value;
  if (token) await getStore().tx(tx => tx.sessions.remove(tokenHash(token)));
  jar.set(COOKIE, '', { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:0 });
}

export function isSameOrigin(request: Request) {
  const origin=request.headers.get('origin');
  if(!origin)return false;
  const expected=process.env.APP_ORIGIN;
  if(expected)return origin.replace(/\/$/,'')===expected.replace(/\/$/,'');
  const host=request.headers.get('x-forwarded-host')||request.headers.get('host');
  return !!host&&new URL(origin).host===host;
}

export function authCookieName() { return COOKIE; }
