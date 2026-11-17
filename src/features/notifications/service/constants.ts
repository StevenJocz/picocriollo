import type { Category, ChannelId, Priority } from '../../../server/storage/types.ts';

export const CATEGORY_LABELS: Record<Category, string> = {
  incubacion: 'Incubación y nacimientos', salud: 'Salud y cuidado', mantenimiento: 'Limpieza y mantenimiento', inventario: 'Inventario',
  comercial: 'Mercado y ofertas', transferencia: 'Transferencias y entregas', seguridad: 'Cuenta y seguridad', sistema: 'Sistema',
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
export const PRIORITY_LABELS: Record<Priority, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };
export const CHANNEL_LABELS: Record<ChannelId, string> = { inApp: 'Dentro de la app', browser: 'Navegador', email: 'Correo electrónico', push: 'Notificaciones push' };
export const CHANNELS = Object.keys(CHANNEL_LABELS) as ChannelId[];
