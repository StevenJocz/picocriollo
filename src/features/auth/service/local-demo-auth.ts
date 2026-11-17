'use client';

import type { AuthUser } from '../components/auth-screen';

type StoredAccount = AuthUser & { salt: string; passwordHash: string };
const ACCOUNTS_KEY = 'pico-criollo.local-demo.accounts.v1';
const SESSION_KEY = 'pico-criollo.local-demo.session.v1';

function accounts(): StoredAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]') as StoredAccount[]; }
  catch { return []; }
}
function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: 120_000 }, key, 256);
  return base64(new Uint8Array(bits));
}
function safeUser({ id, email }: AuthUser): AuthUser { return { id, email }; }

export const localDemoAuth = {
  currentUser(): AuthUser | null {
    try {
      const id = localStorage.getItem(SESSION_KEY);
      const account = id ? accounts().find(row => row.id === id) : undefined;
      return account ? safeUser(account) : null;
    } catch { return null; }
  },
  async register(emailInput: string, password: string): Promise<AuthUser> {
    const email = emailInput.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Escribe un correo electrónico válido.');
    if (password.length < 12 || password.length > 128) throw new Error('Usa una contraseña de 12 a 128 caracteres.');
    const rows = accounts();
    if (rows.some(account => account.email === email)) throw new Error('Ya existe una cuenta local con ese correo. Inicia sesión.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user = { id: crypto.randomUUID(), email };
    rows.push({ ...user, salt: base64(salt), passwordHash: await hashPassword(password, salt) });
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(rows));
      localStorage.setItem(SESSION_KEY, user.id);
    } catch { throw new Error('No se pudo guardar la cuenta en este navegador.'); }
    return user;
  },
  async login(emailInput: string, password: string): Promise<AuthUser> {
    const email = emailInput.trim().toLowerCase();
    const account = accounts().find(row => row.email === email);
    if (!account) throw new Error('No existe una cuenta local con ese correo. Crea una cuenta primero.');
    const actual = await hashPassword(password, Uint8Array.from(atob(account.salt), char => char.charCodeAt(0)));
    if (actual !== account.passwordHash) throw new Error('Correo o contraseña incorrectos.');
    localStorage.setItem(SESSION_KEY, account.id);
    return safeUser(account);
  },
  logout() { localStorage.removeItem(SESSION_KEY); },
};
