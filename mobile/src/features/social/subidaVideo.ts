import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { direccionDeLaApi, mensajeDeError, tokenDeAcceso } from '@/api/cliente';

export type TrabajoVideo = { jobId: string; status: 'pending' | 'processing' | 'ready' | 'failed'; mediaId?: string; error?: string };
const claveUsuario = (id: string) => 'pico.video.pendiente.' + id;
export async function guardarPendiente(id: string, value: { jobId: string; texto: string } | null) {
  const clave = claveUsuario(id);
  if (Platform.OS === 'web') { value ? localStorage.setItem(clave, JSON.stringify(value)) : localStorage.removeItem(clave); }
  else if (value) await SecureStore.setItemAsync(clave, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(clave);
}
export async function leerPendiente(id: string): Promise<{ jobId: string; texto: string } | null> {
  const clave = claveUsuario(id);
  try { return JSON.parse((Platform.OS === 'web' ? localStorage.getItem(clave) : await SecureStore.getItemAsync(clave)) ?? 'null'); } catch { return null; }
}
export async function subirVideo(blob: Blob): Promise<TrabajoVideo> {
  if (blob.size > 80 * 1024 * 1024) throw Error('El video admite hasta 80 MB y 50 segundos.');
  const res = await fetch(`${direccionDeLaApi()}/api/media/videos`, { method: 'POST', headers: { Authorization: `Bearer ${tokenDeAcceso() ?? ''}`, 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  const datos = await res.json();
  if (!res.ok) throw Error(mensajeDeError(datos, 'No se pudo subir el video.'));
  return datos;
}
export async function consultarVideo(id: string): Promise<TrabajoVideo> {
  const res = await fetch(`${direccionDeLaApi()}/api/media/videos/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${tokenDeAcceso() ?? ''}` } });
  if (res.status === 404) return { jobId: id, status: 'failed', error: 'El trabajo ya no está disponible. Selecciona el video de nuevo.' };
  const datos = await res.json();
  if (!res.ok) throw Error(mensajeDeError(datos, 'No se pudo consultar el video.'));
  return datos;
}
