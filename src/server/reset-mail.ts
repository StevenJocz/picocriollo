import { emailConfigured } from '../features/notifications/service/channels.ts';

type Env = Record<string, string | undefined>;
export interface Mailer { sendMail(message: Record<string, unknown>): Promise<unknown>; }

/** Enlace que llega por correo. El dominio sale solo de APP_ORIGIN, nunca de la petición: un encabezado Host falso podría desviar el enlace a otro sitio. */
export function resetLink(token: string, env: Env): string | undefined {
  const origin = (env.APP_ORIGIN || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000')).replace(/\/$/, '');
  return origin ? `${origin}/restablecer?token=${encodeURIComponent(token)}` : undefined;
}

export function resetEmail(link: string) {
  const text = `Pediste restablecer tu contraseña de Pico Criollo.\n\nAbre este enlace (sirve 30 minutos y una sola vez):\n${link}\n\nSi no fuiste tú, ignora este mensaje: tu contraseña actual sigue igual.`;
  const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:480px;margin:auto;padding:28px;color:#12261b"><h2 style="margin:0 0 12px">Restablece tu contraseña</h2><p style="line-height:1.55">Pediste cambiar la contraseña de tu cuenta de <strong>Pico Criollo</strong>. El enlace sirve <strong>30 minutos</strong> y una sola vez.</p><p style="margin:24px 0"><a href="${link}" style="background:#2c7048;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:600;display:inline-block">Crear contraseña nueva</a></p><p style="font-size:13px;color:#5a6b60;line-height:1.5">Si el botón no abre, copia este enlace en tu navegador:<br>${link}</p><p style="font-size:13px;color:#5a6b60">Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue igual.</p></div>`;
  return { subject: 'Pico Criollo · Restablece tu contraseña', text, html };
}

async function smtpMailer(env: Env): Promise<Mailer> {
  const nodemailer = (await import('nodemailer')).default;
  return nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
}

/** Envía el enlace. Sin SMTP configurado no hay correo: el enlace queda en el registro del servidor para quien administra. */
export async function sendResetEmail(to: string, token: string, options: { env?: Env; mailer?: Mailer; log?: (message: string) => void } = {}): Promise<'sent' | 'logged' | 'skipped'> {
  const env = options.env ?? process.env, link = resetLink(token, env);
  if (!link) {
    (options.log ?? console.error)('[restablecer] Falta APP_ORIGIN en producción: no se envía el enlace.');
    return 'skipped';
  }
  if (!options.mailer && !emailConfigured(env)) {
    (options.log ?? console.warn)(`[restablecer] SMTP sin configurar: enlace para ${to}: ${link}`);
    return 'logged';
  }
  const mailer = options.mailer ?? await smtpMailer(env), mail = resetEmail(link);
  await mailer.sendMail({ from: env.SMTP_FROM, to, ...mail });
  return 'sent';
}
