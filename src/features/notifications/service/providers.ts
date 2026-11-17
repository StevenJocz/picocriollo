import { browserConfigured, emailConfigured } from './channels.ts';
import type { ChannelProvider, ProviderRegistry } from './channels.ts';

type Env = Record<string, string | undefined>;
const origin = (env: Env) => (env.APP_ORIGIN || '').replace(/\/$/, '');

// Proveedores reales. Las librerías se cargan al enviar, así la app arranca igual sin credenciales.
export function emailProvider(env: Env): ChannelProvider {
  let transport: { sendMail(message: Record<string, unknown>): Promise<unknown> } | undefined;
  return {
    id: 'email',
    async send({ notification, user }) {
      if (!transport) {
        const nodemailer = (await import('nodemailer')).default;
        transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
      }
      // Solo al correo de la propia cuenta; el texto ya es el de la notificación interna (sin datos de terceros).
      await transport.sendMail({ from: env.SMTP_FROM, to: user.email, subject: `Pico Criollo · ${notification.title}`, text: `${notification.body}\n\nAbre Pico Criollo${origin(env) ? `: ${origin(env)}` : ''}\n\nRecibes este aviso porque lo activaste en tus preferencias.` });
    },
  };
}

export function webPushProvider(env: Env): ChannelProvider {
  return {
    id: 'browser',
    async send({ notification, subscriptions }) {
      const webpush = (await import('web-push')).default;
      webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
      const payload = JSON.stringify({ title: notification.title, body: notification.body, url: `/?view=${encodeURIComponent(notification.link.view)}`, tag: notification.id });
      const gone: string[] = [];
      let delivered = 0, lastError: unknown;
      for (const subscription of subscriptions) {
        try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload); delivered++; }
        catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(subscription.endpoint); else lastError = error;
        }
      }
      if (!delivered && lastError) throw lastError;
      return { removeEndpoints: gone };
    },
  };
}

export function buildProviders(env: Env = process.env): ProviderRegistry {
  return { ...(emailConfigured(env) ? { email: emailProvider(env) } : {}), ...(browserConfigured(env) ? { browser: webPushProvider(env) } : {}) };
}
