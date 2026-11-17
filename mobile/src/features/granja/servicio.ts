import { api, mensajeDeError, SIN_CONEXION, type components } from '@/api/cliente';

export type Modulo = 'gallinero' | 'ave' | 'recoleccion' | 'incubacion' | 'compra' | 'consumo' | 'tarea' | 'nacimiento' | 'grupo' | 'cliente' | 'producto';
export type Cuerpo = Record<string, unknown>;

type Esquemas = components['schemas'];
export interface Guardado { id: string; codigo: string | null; version: number; mensaje: string }

/** Convierte la respuesta de la API en un resultado o en un Error con un mensaje para la persona. */
async function resolver(llamada: Promise<{ data?: Esquemas['RegistroGuardadoDto']; error?: unknown; response: Response }>): Promise<Guardado> {
  let resultado;
  try { resultado = await llamada; } catch { throw new Error(SIN_CONEXION); }
  const { data, error, response } = resultado;
  if (!response.ok || !data) throw new Error(mensajeDeError(error));
  return { id: data.id ?? '', codigo: data.codigo ?? null, version: Number(data.version ?? 0), mensaje: data.mensaje ?? '' };
}

// El formulario arma el cuerpo con las mismas claves del DTO; la API es quien lo valida de verdad.
export function crear(modulo: Modulo, cuerpo: Cuerpo): Promise<Guardado> {
  switch (modulo) {
    case 'gallinero': return resolver(api.POST('/api/granja/gallineros', { body: cuerpo as Esquemas['GallineroDto'] }));
    case 'ave': return resolver(api.POST('/api/granja/aves', { body: cuerpo as Esquemas['AveDto'] }));
    case 'recoleccion': return resolver(api.POST('/api/granja/recolecciones', { body: cuerpo as Esquemas['RecoleccionDto'] }));
    case 'incubacion': return resolver(api.POST('/api/granja/incubaciones', { body: cuerpo as Esquemas['IncubacionDto'] }));
    case 'compra': return resolver(api.POST('/api/granja/compras', { body: cuerpo as Esquemas['CompraDto'] }));
    case 'consumo': return resolver(api.POST('/api/granja/consumos', { body: cuerpo as Esquemas['ConsumoDto'] }));
    case 'tarea': return resolver(api.POST('/api/granja/tareas', { body: cuerpo as Esquemas['TareaDto'] }));
    case 'nacimiento': return resolver(api.POST('/api/granja/nacimientos', { body: cuerpo as Esquemas['NacimientoDto'] }));
    case 'grupo': return resolver(api.POST('/api/granja/grupos-reproductores', { body: cuerpo as Esquemas['GrupoReproductorDto'] }));
    case 'cliente': return resolver(api.POST('/api/granja/clientes', { body: cuerpo as Esquemas['ClienteDto'] }));
    case 'producto': return resolver(api.POST('/api/granja/productos', { body: cuerpo as Esquemas['ProductoDto'] }));
  }
}

export function actualizar(modulo: Exclude<Modulo, 'consumo'>, id: string, cuerpo: Cuerpo): Promise<Guardado> {
  const params = { path: { id } };
  switch (modulo) {
    case 'gallinero': return resolver(api.PUT('/api/granja/gallineros/{id}', { params, body: cuerpo as Esquemas['GallineroDto'] }));
    case 'ave': return resolver(api.PUT('/api/granja/aves/{id}', { params, body: cuerpo as Esquemas['AveDto'] }));
    case 'recoleccion': return resolver(api.PUT('/api/granja/recolecciones/{id}', { params, body: cuerpo as Esquemas['RecoleccionDto'] }));
    case 'incubacion': return resolver(api.PUT('/api/granja/incubaciones/{id}', { params, body: cuerpo as Esquemas['IncubacionDto'] }));
    case 'compra': return resolver(api.PUT('/api/granja/compras/{id}', { params, body: cuerpo as Esquemas['CompraDto'] }));
    case 'tarea': return resolver(api.PUT('/api/granja/tareas/{id}', { params, body: cuerpo as Esquemas['TareaDto'] }));
    case 'nacimiento': return resolver(api.PUT('/api/granja/nacimientos/{id}', { params, body: cuerpo as Esquemas['NacimientoDto'] }));
    case 'grupo': return resolver(api.PUT('/api/granja/grupos-reproductores/{id}', { params, body: cuerpo as Esquemas['GrupoReproductorDto'] }));
    case 'cliente': return resolver(api.PUT('/api/granja/clientes/{id}', { params, body: cuerpo as Esquemas['ClienteDto'] }));
    case 'producto': return resolver(api.PUT('/api/granja/productos/{id}', { params, body: cuerpo as Esquemas['ProductoDto'] }));
  }
}

export function eliminar(modulo: Exclude<Modulo, 'consumo'>, id: string): Promise<Guardado> {
  const params = { path: { id } };
  switch (modulo) {
    case 'gallinero': return resolver(api.DELETE('/api/granja/gallineros/{id}', { params }));
    case 'ave': return resolver(api.DELETE('/api/granja/aves/{id}', { params }));
    case 'recoleccion': return resolver(api.DELETE('/api/granja/recolecciones/{id}', { params }));
    case 'incubacion': return resolver(api.DELETE('/api/granja/incubaciones/{id}', { params }));
    case 'compra': return resolver(api.DELETE('/api/granja/compras/{id}', { params }));
    case 'tarea': return resolver(api.DELETE('/api/granja/tareas/{id}', { params }));
    case 'nacimiento': return resolver(api.DELETE('/api/granja/nacimientos/{id}', { params }));
    case 'grupo': return resolver(api.DELETE('/api/granja/grupos-reproductores/{id}', { params }));
    case 'cliente': return resolver(api.DELETE('/api/granja/clientes/{id}', { params }));
    case 'producto': return resolver(api.DELETE('/api/granja/productos/{id}', { params }));
  }
}

export const completarTarea = (id: string, hoy: string): Promise<Guardado> =>
  resolver(api.POST('/api/granja/tareas/{id}/completar', { params: { path: { id } }, body: { hoy } }));

// ---------- anillos y eventos de cada ave ----------
export const asignarAnillo = (number: number, birdId: string): Promise<Guardado> => resolver(api.POST('/api/granja/anillos/asignar', { body: { number, birdId } }));
export const retirarAnillo = (birdId: string): Promise<Guardado> => resolver(api.POST('/api/granja/anillos/retirar', { body: { birdId } }));
export const inhabilitarAnillo = (number: number, notes: string): Promise<Guardado> => resolver(api.POST('/api/granja/anillos/inhabilitar', { body: { number, notes } }));
export const activarAnillo = (number: number): Promise<Guardado> => resolver(api.POST('/api/granja/anillos/activar', { body: { number } }));
export const registrarEventoAve = (cuerpo: { birdId: string; kind: string; date: string; title: string; details: string }): Promise<Guardado> => resolver(api.POST('/api/granja/eventos-ave', { body: cuerpo }));

// ---------- lotes, ventas, trazabilidad y reportes ----------
export const crearLoteHuevos = (cuerpo: Esquemas['LoteHuevosNuevoDto']): Promise<Guardado> => resolver(api.POST('/api/granja/lotes-huevos', { body: cuerpo }));
export const dividirLote = (id: string, quantity: number): Promise<Guardado> => resolver(api.POST('/api/granja/lotes-huevos/{id}/dividir', { params: { path: { id } }, body: { quantity } }));
export const actualizarLote = (id: string, fertility: string, storageNotes: string): Promise<Guardado> => resolver(api.PUT('/api/granja/lotes-huevos/{id}', { params: { path: { id } }, body: { fertility, storageNotes } }));
export const registrarVenta = (cuerpo: Esquemas['VentaNuevaDto']): Promise<Guardado> => resolver(api.POST('/api/granja/ventas', { body: cuerpo }));
export const anularVenta = (id: string): Promise<Guardado> => resolver(api.POST('/api/granja/ventas/{id}/anular', { params: { path: { id } } }));
export const abonarVenta = (id: string, amount: number, method: string): Promise<Guardado> => resolver(api.POST('/api/granja/ventas/{id}/abonos', { params: { path: { id } }, body: { amount, method } }));
export const devolverLinea = (id: string, lineId: string, quantity: number): Promise<Guardado> => resolver(api.POST('/api/granja/ventas/{id}/devoluciones', { params: { path: { id } }, body: { lineId, quantity } }));

async function datos<T>(llamada: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let r;
  try { r = await llamada; } catch { throw new Error(SIN_CONEXION); }
  if (!r.response.ok) throw new Error(mensajeDeError(r.error));
  return r.data as T;
}
export const trazar = (codigo: string) => datos(api.GET('/api/granja/trazabilidad', { params: { query: { codigo } } }));
export const resumenComercial = (desde?: string, hasta?: string) => datos(api.GET('/api/granja/resumen-comercial', { params: { query: { desde, hasta } } }));
