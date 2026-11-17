// Enlaces de video de YouTube, TikTok e Instagram para mostrarlos como reproductor dentro de las publicaciones.
// Seguridad: lista cerrada de dominios exactos, id extraído con expresión estricta y URL del reproductor construida SIEMPRE aquí
// (nunca se incrusta el enlace tal como lo escribió la persona). Sin imports de Next: se prueba con node --test.

export type VideoProvider = 'youtube' | 'tiktok' | 'instagram';
export interface VideoLink {
  provider: VideoProvider;
  id: string;
  /** youtube: watch|shorts · instagram: reel|p|tv · tiktok: video */
  kind: string;
  /** Enlace canónico (sin parámetros de seguimiento) para «Ver en …». */
  url: string;
  aspect: 'portrait' | 'landscape' | 'square';
}

export const PROVIDER_LABELS: Record<VideoProvider, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const TT_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const YT_ID = /^[A-Za-z0-9_-]{11}$/, TT_ID = /^\d{8,25}$/, IG_CODE = /^[A-Za-z0-9_-]{5,20}$/, TT_USER = /^@[\w.]{1,40}$/, IG_USER = /^[A-Za-z0-9._]{1,30}$/;
const KNOWN_BARE = /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com)(?:[/?#]|$)/i;
const MAX_LENGTH = 500;

export function parseVideoLink(raw: string): VideoLink | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > MAX_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : KNOWN_BARE.test(text) ? `https://${text}` : '';
  if (!withScheme) return null;
  let url: URL;
  try { url = new URL(withScheme); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (YT_HOSTS.has(host)) {
    let id: string | null = null, kind = 'watch';
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (parts[0] === 'shorts') { id = parts[1] ?? null; kind = 'shorts'; }
    else if (['embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    if (!id || !YT_ID.test(id)) return null;
    return { provider: 'youtube', id, kind, url: kind === 'shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, aspect: kind === 'shorts' ? 'portrait' : 'landscape' };
  }

  if (TT_HOSTS.has(host)) {
    let id: string | null = null, user = '';
    if (parts.length === 3 && TT_USER.test(parts[0]!) && parts[1] === 'video') { user = parts[0]!; id = parts[2]!; }
    else if (parts[0] === 'embed' && parts[1] === 'v2') id = parts[2] ?? null;
    else if (parts[0] === 'embed') id = parts[1] ?? null;
    if (!id || !TT_ID.test(id)) return null;
    return { provider: 'tiktok', id, kind: 'video', url: user ? `https://www.tiktok.com/${user}/video/${id}` : `https://www.tiktok.com/embed/v2/${id}`, aspect: 'portrait' };
  }

  if (IG_HOSTS.has(host)) {
    const at = parts.findIndex(part => ['reel', 'reels', 'p', 'tv'].includes(part));
    if (at === -1 || at > 1 || (at === 1 && !IG_USER.test(parts[0]!))) return null;
    const code = parts[at + 1];
    if (!code || !IG_CODE.test(code) || parts.length > at + 2) return null;
    const kind = parts[at] === 'reels' ? 'reel' : parts[at]!;
    return { provider: 'instagram', id: code, kind, url: `https://www.instagram.com/${kind}/${code}/`, aspect: kind === 'p' ? 'square' : 'portrait' };
  }
  return null;
}

/** URL del reproductor oficial. `autoplay` solo se usa cuando la persona ya pulsó «reproducir». */
export function embedUrl(link: Pick<VideoLink, 'provider' | 'id' | 'kind'>, autoplay = false): string {
  if (link.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${link.id}?rel=0&playsinline=1${autoplay ? '&autoplay=1' : ''}`;
  if (link.provider === 'tiktok') return `https://www.tiktok.com/embed/v2/${link.id}`;
  return `https://www.instagram.com/${link.kind === 'p' || link.kind === 'tv' ? link.kind : 'reel'}/${link.id}/embed`;
}

/** Plataformas de las que se pueden compartir videos en publicaciones nuevas. TikTok e Instagram se enlazan desde el perfil. */
export const SHAREABLE_PROVIDERS: readonly VideoProvider[] = ['youtube'];

/** Enlace de video que se puede compartir en una publicación (hoy, solo YouTube). */
export function parseShareableVideoLink(raw: string): VideoLink | null {
  const link = parseVideoLink(raw);
  return link && SHAREABLE_PROVIDERS.includes(link.provider) ? link : null;
}

/** Primer enlace compartible dentro de un texto (ignora signos finales como «.» o «)»). */
export function findVideoLink(text: string): VideoLink | null {
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)) {
    const link = parseShareableVideoLink(match[0].replace(/[.,;:!?)\]]+$/, ''));
    if (link) return link;
  }
  return null;
}

/** Mensaje claro cuando un enlace no se puede compartir en una publicación. */
export function describeUnshareableLink(raw: string): string {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (/(?:^|\.|\/\/)(?:tiktok|instagram)\.com|(?:^|\/\/)(?:vm|vt)\.tiktok\.com/.test(text)) return 'Solo se pueden compartir videos de YouTube. Tu TikTok o Instagram los puedes mostrar agregando el enlace de tu perfil en tu cuenta.';
  return 'No reconocemos ese enlace. Pega el enlace de un video público de YouTube.';
}

/** Mensaje claro cuando un enlace no se puede usar. */
export function describeInvalidVideoLink(raw: string): string {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (/(?:^|\/\/)(?:vm|vt)\.tiktok\.com|tiktok\.com\/t\//.test(text)) return 'Los enlaces cortos de TikTok no funcionan: abre el video y copia el enlace completo (tiktok.com/@usuario/video/…).';
  return 'No reconocemos ese enlace. Pega el enlace de un video público de YouTube, TikTok o Instagram (reel o publicación).';
}
