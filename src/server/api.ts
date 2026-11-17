import { currentUser, isSameOrigin, type SessionUser } from './auth.ts';
import { HttpError, UnauthorizedError, ValidationError } from './errors.ts';
import { StoreConflictError } from './storage/types.ts';

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export interface RouteContext { request: Request; user: SessionUser | null; params: Record<string, string>; }
type NextContext = { params: Promise<Record<string, string>> };
type Handler = (ctx: RouteContext) => Promise<unknown>;

// Envoltorio común: origen en métodos mutadores, usuario de sesión, errores → códigos HTTP.
export function route(options: { auth: boolean; mutating?: boolean }, handler: Handler) {
  return async (request: Request, context: NextContext): Promise<Response> => {
    try {
      if (options.mutating) {
        if (!isSameOrigin(request)) throw new HttpError(403, 'Origen de solicitud no permitido.');
        if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Se requiere contenido JSON.');
      }
      const user = await currentUser();
      if (options.auth && !user) throw new UnauthorizedError();
      const params = context?.params ? await context.params : {};
      const result = await handler({ request, user, params });
      return result instanceof Response ? result : json(result);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof StoreConflictError) return json({ error: 'La operación entra en conflicto con otro registro existente.' }, 409);
      console.error('[api]', error);
      return json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' }, 503);
    }
  };
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('forma');
    return body as Record<string, unknown>;
  } catch { throw new ValidationError('Solicitud inválida.'); }
}

export const requireUser = (ctx: RouteContext): SessionUser => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const str = (value: unknown, field: string, max = 500, required = false): string => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`Falta ${field}.`);
    return '';
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} no es válido.`);
  const text = value.trim();
  if (required && !text) throw new ValidationError(`Falta ${field}.`);
  if (text.length > max) throw new ValidationError(`${field} supera ${max} caracteres.`);
  return text;
};

export const num = (value: unknown, field: string, min = 0, max = 1_000_000_000): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${field} no es válido.`);
  return n;
};

export const flag = (value: unknown): boolean => value === true;
