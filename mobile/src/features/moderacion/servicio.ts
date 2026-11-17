import { api, type components } from '@/api/cliente';
import { resolver as respuesta } from '@/features/mercado/servicio';
export type Denuncia = components['schemas']['DenunciaVista'];
export type Disputa = components['schemas']['Operacion'];
export async function denunciar(targetType: string, targetId: string, reason: string) {
  await respuesta(api.POST('/api/moderacion/denuncias', { body: { targetType, targetId, reason } }));
}
export async function cargarCasos() {
  const [denuncias, disputas] = await Promise.all([respuesta(api.GET('/api/moderacion/denuncias')), respuesta(api.GET('/api/moderacion/disputas'))]);
  return { denuncias, disputas };
}
export async function resolver(id: string, action: string, note: string, disputa = false) {
  const llamada = disputa
    ? api.POST('/api/moderacion/disputas/{id}/resolver', { params: { path: { id } }, body: { action, note } })
    : api.POST('/api/moderacion/denuncias/{id}/resolver', { params: { path: { id } }, body: { action, note } });
  await respuesta(llamada);
}
