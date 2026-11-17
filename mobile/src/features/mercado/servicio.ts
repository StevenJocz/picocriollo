import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, mensajeDeError, SIN_CONEXION, type components } from '@/api/cliente';

type E = components['schemas'];
export type Publicacion = E['PublicacionVistaDto'];
export type MiPublicacion = E['MiPublicacionDto'];
export type Detalle = E['DetallePublicacionDto'];
export type Operacion = E['OperacionVistaDto'];
export type Resumen = E['ResumenConversacionDto'];
export type Conversacion = E['ConversacionDto'];
export type Factura = E['FacturaDto'];
export type ResumenFactura = E['ResumenFacturaDto'];
export type Interesado = E['InteresadoDto'];
export type MiOferta = E['MiOfertaDto'];

type Resultado<T> = { data?: T; error?: unknown; response: Response };

/** Devuelve los datos de la respuesta o lanza un Error con el mensaje que la API dio (o el de «sin conexión»). */
export async function resolver<T>(llamada: Promise<Resultado<T>>): Promise<T> {
  let r: Resultado<T>;
  try { r = await llamada; } catch { throw new Error(SIN_CONEXION); }
  if (!r.response.ok) throw new Error(mensajeDeError(r.error));
  return r.data as T;
}

export const explorar = (q: { q?: string; kind?: string; type?: string; limit?: number }) => resolver(api.GET('/api/mercado', { params: { query: q } }));
export const detalle = (id: string) => resolver(api.GET('/api/mercado/{id}', { params: { path: { id } } }));
export const misPublicaciones = (filtro?: string) => resolver(api.GET('/api/mercado/mias', { params: { query: { filtro } } }));
export const crearPublicacion = (cuerpo: Record<string, unknown>) => resolver(api.POST('/api/mercado/publicaciones', { body: cuerpo as E['PublicacionNuevaDto'] }));
export const interesados = (id: string) => resolver(api.GET('/api/mercado/publicaciones/{id}/interesados', { params: { path: { id } } }));
export const misOfertas = () => resolver(api.GET('/api/mercado/mis-ofertas'));

type Accion = 'publicar' | 'pausar' | 'reanudar' | 'retirar' | 'actualizar-ficha';
export const accionPublicacion = (id: string, accion: Accion) => resolver(api.POST(`/api/mercado/publicaciones/{id}/${accion}` as '/api/mercado/publicaciones/{id}/publicar', { params: { path: { id } } }));
export const cancelarSubasta = (id: string, reason: string) => resolver(api.POST('/api/mercado/publicaciones/{id}/cancelar-subasta', { params: { path: { id } }, body: { reason } }));
export const mostrarInteres = (id: string, message: string) => resolver(api.POST('/api/mercado/publicaciones/{id}/interes', { params: { path: { id } }, body: { message } }));
export const retirarInteres = (id: string) => resolver(api.DELETE('/api/mercado/publicaciones/{id}/interes', { params: { path: { id } } }));
export const ofertar = (id: string, amount: number, idempotencyKey: string) => resolver(api.POST('/api/mercado/publicaciones/{id}/ofertas', { params: { path: { id } }, body: { amount, idempotencyKey } }));
export const solicitarCompra = (id: string, message: string) => resolver(api.POST('/api/mercado/publicaciones/{id}/solicitud', { params: { path: { id } }, body: { message } }));

export const operaciones = (rol?: string) => resolver(api.GET('/api/operaciones', { params: { query: { rol } } }));
export const responderSolicitud = (id: string, decision: 'accept' | 'reject') => resolver(api.POST('/api/operaciones/{id}/responder', { params: { path: { id } }, body: { decision } }));
export const retirarSolicitud = (id: string) => resolver(api.POST('/api/operaciones/{id}/retirar', { params: { path: { id } } }));
export const declararPago = (id: string, method: string) => resolver(api.POST('/api/operaciones/{id}/pago', { params: { path: { id } }, body: { method } }));
export const confirmarPago = (id: string) => resolver(api.POST('/api/operaciones/{id}/confirmar-pago', { params: { path: { id } } }));
export const marcarEntrega = (id: string) => resolver(api.POST('/api/operaciones/{id}/entrega', { params: { path: { id } } }));
export const confirmarRecepcion = (id: string) => resolver(api.POST('/api/operaciones/{id}/recepcion', { params: { path: { id } } }));
export const cancelarOperacion = (id: string, reason: string) => resolver(api.POST('/api/operaciones/{id}/cancelar', { params: { path: { id } }, body: { reason } }));
export const abrirDisputa = (id: string, reason: string) => resolver(api.POST('/api/operaciones/{id}/disputa', { params: { path: { id } }, body: { reason } }));
export const compartirContacto = (id: string) => resolver(api.POST('/api/operaciones/{id}/compartir-contacto', { params: { path: { id } } }));
export const verContacto = (id: string) => resolver(api.GET('/api/operaciones/{id}/contacto', { params: { path: { id } } }));
export const valorar = (id: string, stars: number, comment: string) => resolver(api.POST('/api/operaciones/{id}/valoracion', { params: { path: { id } }, body: { stars, comment } }));

export const conversaciones = () => resolver(api.GET('/api/mercado/conversaciones'));
export const conversacion = (id: string) => resolver(api.GET('/api/mercado/conversaciones/{id}', { params: { path: { id } } }));
export const enviarMensaje = (cuerpo: { listingId?: string; threadId?: string; body: string }) => resolver(api.POST('/api/mercado/mensajes', { body: cuerpo }));

export const facturas = () => resolver(api.GET('/api/facturas'));
export const factura = (numero: string) => resolver(api.GET('/api/facturas/{numero}', { params: { path: { numero } } }));

/** Carga datos al entrar en la pantalla (y cada vez que se vuelve a ella) con estados de carga y error. */
export function useDatos<T>(cargar: () => Promise<T>, claves: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(async () => {
    try { setDatos(await cargar()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar.'); }
    finally { setCargando(false); }
  }, claves);

  useFocusEffect(useCallback(() => { void recargar(); }, [recargar]));
  useEffect(() => { setCargando(true); }, claves); // eslint-disable-line react-hooks/exhaustive-deps
  return { datos, error, cargando, recargar };
}

/** Una clave nueva por intento: si el intento se repite por un corte de red, la API devuelve la misma oferta. */
export const claveDeOferta = () => `oferta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
