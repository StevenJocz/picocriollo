import { api, direccionDeLaApi, mensajeDeError, SIN_CONEXION, tokenDeAcceso, type components } from '@/api/cliente';
import { resolver } from '@/features/mercado/servicio';

type E = components['schemas'];
export type Post = E['PostDto'];
export type Comentario = E['ComentarioDto'];
export type PerfilPublico = E['PerfilPublicoDto'];
export type MiPerfil = E['MiPerfilDto'];
export type ElementoReel = E['ElementoReelDto'];
export type Notificacion = E['NotificacionDto'];
export type Preferencias = E['PreferenciasDto'];

// ---------- perfil ----------
export const miPerfil = () => resolver(api.GET('/api/perfil'));
export const destacados = () => resolver(api.GET('/api/perfiles/destacados'));
export const actualizarPerfil = (body: E['PerfilCambioDto']) => resolver(api.PUT('/api/perfil', { body }));
export const guardarRedes = (body: E['RedesDto']) => resolver(api.PUT('/api/perfil/redes', { body }));
export const guardarUbicacion = (body: E['UbicacionDto']) => resolver(api.PUT('/api/perfil/ubicacion', { body }));
export const perfil = (id: string) => resolver(api.GET('/api/perfiles/{id}', { params: { path: { id } } }));
export const muro = (id: string, antes?: string) => resolver(api.GET('/api/perfiles/{id}/publicaciones', { params: { path: { id }, query: { antes } } }));
export const seguir = (id: string, seguir: boolean) => resolver(seguir ? api.POST('/api/perfiles/{id}/seguir', { params: { path: { id } } }) : api.DELETE('/api/perfiles/{id}/seguir', { params: { path: { id } } }));

// ---------- publicaciones ----------
export const post = (id: string) => resolver(api.GET('/api/publicaciones-perfil/{id}', { params: { path: { id } } }));
export const crearPost = (body: E['PublicacionPerfilNuevaDto']) => resolver(api.POST('/api/publicaciones-perfil', { body }));
export const editarPost = (id: string, text: string) => resolver(api.PUT('/api/publicaciones-perfil/{id}', { params: { path: { id } }, body: { text } }));
export const borrarPost = (id: string) => resolver(api.DELETE('/api/publicaciones-perfil/{id}', { params: { path: { id } } }));
export const compartir = (id: string, text: string) => resolver(api.POST('/api/publicaciones-perfil/{id}/compartir', { params: { path: { id } }, body: { text } }));
export const meGusta = (id: string, liked: boolean) => resolver(api.PUT('/api/publicaciones-perfil/{id}/me-gusta', { params: { path: { id } }, body: { liked } }));
export const comentarios = (id: string, despues?: string) => resolver(api.GET('/api/publicaciones-perfil/{id}/comentarios', { params: { path: { id }, query: { despues } } }));
export const respuestas = (comentarioId: string) => resolver(api.GET('/api/publicaciones-perfil/comentarios/{comentarioId}/respuestas', { params: { path: { comentarioId } } }));
export const comentar = (id: string, text: string, parentId?: string) => resolver(api.POST('/api/publicaciones-perfil/{id}/comentarios', { params: { path: { id } }, body: { text, parentId } }));
export const borrarComentario = (comentarioId: string) => resolver(api.DELETE('/api/publicaciones-perfil/comentarios/{comentarioId}', { params: { path: { comentarioId } } }));

// ---------- reels ----------
export const reels = (q: { antes?: string; limite?: number; etiqueta?: string; q?: string; vistos?: string; semilla?: string }) => resolver(api.GET('/api/reels', { params: { query: q } }));
export const enviarSenales = (signals: { key: string; type: 'view' | 'open'; ms?: number }[]) => resolver(api.POST('/api/reels/senales', { body: { signals } }));

/** Sube una foto (JPG, PNG o WEBP) con su tipo real. Va aparte del cliente generado porque el cuerpo es el archivo tal cual. */
export async function subirFoto(cuerpo: Blob, uso: 'post' | 'avatar' | 'bird'): Promise<{ id: string; url: string }> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${direccionDeLaApi()}/api/media?uso=${uso}`, { method: 'POST', headers: { 'Content-Type': cuerpo.type || 'image/jpeg', Authorization: `Bearer ${tokenDeAcceso() ?? ''}` }, body: cuerpo });
  } catch { throw new Error(SIN_CONEXION); }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(mensajeDeError(datos, 'No se pudo subir la foto.'));
  return datos as { id: string; url: string };
}

// ---------- notificaciones ----------
export const notificaciones = (q: { estado?: string; limite?: number; antes?: string } = {}) => resolver(api.GET('/api/notificaciones', { params: { query: q } }));
export const resumenNotificaciones = () => resolver(api.GET('/api/notificaciones/resumen'));
export const leerNotificaciones = (ids: string[]) => resolver(api.POST('/api/notificaciones/leer', { body: { ids } }));
export const leerTodas = () => resolver(api.POST('/api/notificaciones/leer-todas'));
export const preferencias = () => resolver(api.GET('/api/notificaciones/preferencias'));
// El contrato marca como «presentes» los campos que pueden ser null; aquí se manda solo lo que cambia.
export const actualizarPreferencias = (body: Partial<E['PreferenciasCambioDto']>) => resolver(api.PUT('/api/notificaciones/preferencias', { body: body as E['PreferenciasCambioDto'] }));
export const registrarDispositivo = (token: string, plataforma: string) => resolver(api.POST('/api/notificaciones/dispositivos', { body: { token, plataforma } }));
