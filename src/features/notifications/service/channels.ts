import type { ChannelId, NotificationRecord, PreferencesRecord, PushSubscriptionRecord, UserRecord } from '../../../server/storage/types.ts';
import { CHANNEL_LABELS, CHANNELS } from './constants.ts';

// Puerto de canales externos. Un canal existe solo si hay un proveedor real con credenciales configuradas.
export interface DeliveryContext { notification: NotificationRecord; user: UserRecord; prefs: PreferencesRecord; subscriptions: PushSubscriptionRecord[]; }
export interface SendResult { removeEndpoints?: string[]; }
export interface ChannelProvider { id: ChannelId; send(context: DeliveryContext): Promise<SendResult | void>; }
export type ProviderRegistry = Partial<Record<ChannelId, ChannelProvider>>;

type Env = Record<string, string | undefined>;
export const emailConfigured = (env: Env) => Boolean(env.SMTP_HOST && env.SMTP_FROM);
export const browserConfigured = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

export interface ChannelStatus { id: ChannelId; label: string; configured: boolean; detail: string; vapidPublicKey?: string; }

// Lo que ve la interfaz: sin credenciales el canal figura como "No configurado" y no se puede activar.
export function channelStatus(env: Env = process.env): ChannelStatus[] {
  const states: Record<ChannelId, { ok: boolean; detail: string }> = {
    inApp: { ok: true, detail: 'Siempre disponible.' },
    browser: browserConfigured(env) ? { ok: true, detail: 'Disponible: se activa con el permiso explícito del navegador.' } : { ok: false, detail: 'No configurado: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT.' },
    email: emailConfigured(env) ? { ok: true, detail: 'Disponible: se envía a tu correo de cuenta.' } : { ok: false, detail: 'No configurado: faltan SMTP_HOST y SMTP_FROM.' },
    push: { ok: false, detail: 'No disponible: el puerto está preparado, pero aún no hay un proveedor de push móvil implementado.' },
  };
  return CHANNELS.map(id => ({ id, label: CHANNEL_LABELS[id], configured: states[id].ok, detail: states[id].detail, ...(id === 'browser' && states.browser.ok ? { vapidPublicKey: env.VAPID_PUBLIC_KEY } : {}) }));
}
