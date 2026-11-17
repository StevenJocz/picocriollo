import createClient, { type Middleware } from 'openapi-fetch';
import { Platform } from 'react-native';
import type { components, paths } from './schema';

export type { components, paths };
export type Usuario = components['schemas']['UsuarioDto'];
export type InicioRespuesta = components['schemas']['InicioRespuestaDto'];

function direccionBase(): string {
  const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5188';
  // En el emulador de Android, localhost es el propio emulador; la máquina anfitriona se ve como 10.0.2.2.
  return Platform.OS === 'android' ? url.replace('//localhost', '//10.0.2.2').replace('//127.0.0.1', '//10.0.2.2') : url;
}

/** Dirección completa de un archivo de la API (`/api/media/…`); los enlaces externos se dejan igual. */
export const urlAbsoluta = (ruta?: string | null): string | undefined => (ruta ? (/^https?:/i.test(ruta) ? ruta : `${direccionBase()}${ruta}`) : undefined);

/** El estado de la sesión (tokens) lo maneja src/auth/sesion.tsx; el cliente solo lo consulta y lo renueva. */
export interface EnlaceDeSesion {
  tokenDeAcceso(): string | null;
  /** Pide un token nuevo con el refresco guardado. Devuelve el token de acceso o null si la sesión ya no sirve. */
  renovar(): Promise<string | null>;
}

let enlace: EnlaceDeSesion | null = null;
export const conectarSesion = (nuevo: EnlaceDeSesion) => { enlace = nuevo; };
/** El token de acceso vigente, para las pocas llamadas que no pasan por el cliente generado (subir una foto). */
export const tokenDeAcceso = (): string | null => enlace?.tokenDeAcceso() ?? null;
export const direccionDeLaApi = direccionBase;

// Las rutas de autenticación no llevan token ni se reintentan al recibir 401 (un 401 ahí es «clave incorrecta»).
const esRutaPublica = (url: string) => /\/api\/auth\/(login|registro|refrescar|salir|olvido-password|restablecer-password)$/.test(new URL(url).pathname);

const autenticacion: Middleware = {
  async onRequest({ request }) {
    const token = enlace?.tokenDeAcceso();
    if (token && !esRutaPublica(request.url)) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401 || esRutaPublica(request.url) || !enlace) return response;
    const nuevo = await enlace.renovar();
    if (!nuevo) return response;
    const reintento = new Request(request, { headers: new Headers(request.headers) });
    reintento.headers.set('Authorization', `Bearer ${nuevo}`);
    return fetch(reintento);
  },
};

export const api = createClient<paths>({ baseUrl: direccionBase() });
api.use(autenticacion);

/** El mensaje que viene de la API ({ respuesta, mensaje }) o uno por defecto cuando no hay conexión. */
export function mensajeDeError(error: unknown, porDefecto = 'No se pudo completar la operación. Inténtalo de nuevo.'): string {
  if (error && typeof error === 'object' && 'mensaje' in error && typeof error.mensaje === 'string' && error.mensaje) return error.mensaje;
  return porDefecto;
}

export const SIN_CONEXION = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
