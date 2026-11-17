'use client';

// Cliente HTTP común del mercado y las notificaciones. Los errores del servidor llegan con mensaje en español.
export async function api<T>(url: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: unknown }): Promise<T> {
  const hasBody = init?.body !== undefined;
  const response = await fetch(url, {
    method: init?.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(init!.body) : undefined,
  });
  const body = await response.json().catch(() => ({ error: 'El servidor devolvió una respuesta inválida.' }));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Error HTTP ${response.status}.`);
  return body as T;
}

export const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
export const shortDate = (iso: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
