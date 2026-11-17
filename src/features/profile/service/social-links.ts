import { NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import type { Ctx, Deps } from '../../market/service/listings.ts';

// Enlaces del perfil a las redes del criador. Solo se guardan perfiles (no videos ni publicaciones) de TikTok, Instagram y YouTube,
// siempre en forma canónica: así nunca se publica un enlace hacia otro sitio ni con parámetros de seguimiento.

import { SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from './social-platforms.ts';
export { SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform };

const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal', 'privacy', 'web', 'challenge', 'oauth', 'emails', 'session', 'directory']);

const invalid = (platform: SocialPlatform, hint: string) => new ValidationError(`El enlace de ${SOCIAL_LABELS[platform]} no es válido. ${hint}`);

function urlOf(raw: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : /^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(raw) ? `https://${raw}` : '';
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch { return null; }
}
const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/^(www|m)\./, '');
const segmentsOf = (url: URL) => url.pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });

/** Devuelve el enlace canónico del perfil, o '' si se dejó vacío. Lanza ValidationError si no es un perfil válido de esa red. */
export function normalizeSocialLink(platform: SocialPlatform, raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  const handle = /^@([A-Za-z0-9._-]+)$/.exec(text)?.[1];
  const url = handle ? null : urlOf(text);
  if (!handle && !url) throw invalid(platform, platform === 'youtube' ? 'Pega el enlace de tu canal (youtube.com/@tucanal) o escribe @tucanal.' : `Pega el enlace de tu perfil o escribe @tuusuario.`);

  if (platform === 'tiktok') {
    const name = handle ?? (hostOf(url!) === 'tiktok.com' && segmentsOf(url!).length === 1 && segmentsOf(url!)[0].startsWith('@') ? segmentsOf(url!)[0].slice(1) : '');
    if (!/^[A-Za-z0-9._]{2,24}$/.test(name)) throw invalid(platform, 'Pega el enlace de tu perfil (tiktok.com/@tuusuario), no el de un video.');
    return `https://www.tiktok.com/@${name}`;
  }
  if (platform === 'instagram') {
    const parts = url ? segmentsOf(url) : [];
    const name = handle ?? (hostOf(url!) === 'instagram.com' && parts.length === 1 ? parts[0] : '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(name) || INSTAGRAM_RESERVED.has(name.toLowerCase())) throw invalid(platform, 'Pega el enlace de tu perfil (instagram.com/tuusuario), no el de una publicación.');
    return `https://www.instagram.com/${name}/`;
  }
  if (handle) {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) throw invalid(platform, 'Pega el enlace de tu canal (youtube.com/@tucanal) o escribe @tucanal.');
    return `https://www.youtube.com/@${handle}`;
  }
  const parts = segmentsOf(url!);
  if (hostOf(url!) === 'youtube.com') {
    if (parts.length === 1 && /^@[A-Za-z0-9._-]{3,30}$/.test(parts[0])) return `https://www.youtube.com/${parts[0]}`;
    if (parts.length === 2 && parts[0] === 'channel' && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1])) return `https://www.youtube.com/channel/${parts[1]}`;
    if (parts.length === 2 && (parts[0] === 'c' || parts[0] === 'user') && /^[A-Za-z0-9._-]{2,60}$/.test(parts[1])) return `https://www.youtube.com/${parts[0]}/${parts[1]}`;
  }
  throw invalid(platform, 'Pega el enlace de tu canal (youtube.com/@tucanal), no el de un video.');
}

/** Guarda los enlaces de la cuenta. Las redes que no se mencionan no cambian; un texto vacío quita ese enlace. */
export async function setSocialLinks(deps: Deps, ctx: Ctx, input: Record<string, unknown>): Promise<SocialLinks> {
  const changes: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = input[platform];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 300) throw invalid(platform, 'El texto no es válido.');
    changes[platform] = normalizeSocialLink(platform, value);
  }
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const user = await tx.users.get(ctx.userId);
    if (!user) throw new NotFoundError('Cuenta no encontrada.');
    const next: SocialLinks = { ...(user.social ?? {}) };
    for (const platform of SOCIAL_PLATFORMS) {
      const value = changes[platform];
      if (value === undefined) continue;
      if (value) next[platform] = value; else delete next[platform];
    }
    const updated = { ...user };
    delete updated.social;
    await tx.users.update(Object.keys(next).length ? { ...updated, social: next } : updated);
    return next;
  });
}
