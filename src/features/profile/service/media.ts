import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, HttpError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import { assertRate } from '../../../server/rate-limit.ts';
import type { MediaItemRecord } from '../../../server/storage/types.ts';
import type { Ctx, Deps } from '../../market/service/listings.ts';
import { AVATAR_LIMIT_BYTES, IMAGE_LIMIT_BYTES, IMAGE_MIMES, THUMB_LIMIT_BYTES, USER_QUOTA_BYTES, VIDEO_LIMIT_BYTES, VIDEO_MIMES } from './media-limits.ts';

// Archivos del perfil: fotos, videos y foto de perfil. El tipo se decide por los primeros bytes del archivo, nunca por lo que diga el cliente.

const MB = 1024 * 1024;
export { AVATAR_LIMIT_BYTES, IMAGE_LIMIT_BYTES, IMAGE_MIMES, THUMB_LIMIT_BYTES, USER_QUOTA_BYTES, VIDEO_LIMIT_BYTES, VIDEO_MIMES };
export const ORPHAN_MAX_AGE_MS = 24 * 3_600_000;

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
const startsWith = (bytes: Uint8Array, head: number[]) => bytes.length >= head.length && head.every((value, index) => bytes[index] === value);

/** Tipo real del archivo según su firma, o null si no es una imagen/video permitido (HEIC, GIF, PDF, HTML… se rechazan). */
export function sniffMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)) return null; // imágenes HEIF/AVIF
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

const normalizeMime = (mime: unknown) => (typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg') : '');
const dimension = (value: unknown, label: string): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20_000) throw new ValidationError(`${label} no es válido.`);
  return n;
};

export interface UploadInput { bytes: Uint8Array; mime: unknown; purpose: 'post' | 'avatar'; thumbOf?: string; width?: unknown; height?: unknown; }

export async function uploadMedia(deps: Deps, ctx: Ctx, input: UploadInput): Promise<MediaItemRecord> {
  const { bytes } = input;
  if (!bytes.length) throw new ValidationError('El archivo está vacío.');
  const real = sniffMime(bytes);
  if (!real || ![...IMAGE_MIMES, ...VIDEO_MIMES].includes(real)) throw new ValidationError('Formato no permitido. Usa fotos JPG, PNG o WEBP, o videos MP4, WEBM o MOV.');
  if (normalizeMime(input.mime) !== real) throw new ValidationError('El archivo no coincide con el tipo indicado.');
  const kind: 'image' | 'video' = real.startsWith('video/') ? 'video' : 'image';
  const purpose: MediaItemRecord['purpose'] = input.thumbOf ? 'thumb' : input.purpose;
  if (!['post', 'avatar'].includes(input.purpose)) throw new ValidationError('Uso de archivo no válido.');
  if (purpose !== 'post' && kind !== 'image') throw new ValidationError(purpose === 'avatar' ? 'La foto de perfil debe ser una imagen.' : 'La miniatura debe ser una imagen.');
  const limit = purpose === 'avatar' ? AVATAR_LIMIT_BYTES : purpose === 'thumb' ? THUMB_LIMIT_BYTES : kind === 'video' ? VIDEO_LIMIT_BYTES : IMAGE_LIMIT_BYTES;
  if (bytes.length > limit) throw new HttpError(413, `El archivo pesa ${(bytes.length / MB).toFixed(1)} MB y el máximo es ${Math.round(limit / MB * 10) / 10} MB.`);
  let width = dimension(input.width, 'El ancho'), height = dimension(input.height, 'El alto');
  // Los videos propios se comprimen antes de guardarlos (fuera de la transacción: tarda). Un MP4 que ya pesa menos que el recomprimido se conserva.
  let stored: Uint8Array = bytes, storedMime = real;
  if (kind === 'video' && purpose === 'post' && deps.transcoder) {
    const result = await deps.transcoder.transcode(bytes, real);
    if (!(real === 'video/mp4' && result.bytes.length >= bytes.length)) { stored = result.bytes; storedMime = result.mime; width = result.width; height = result.height; }
  }

  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    await assertRate(tx, ctx.userId, 'media.upload', ctx.now);
    const used = (await tx.mediaItems.list({ ownerId: ctx.userId })).reduce((sum, row) => sum + row.size, 0);
    if (used + stored.length > USER_QUOTA_BYTES) throw new ConflictError('Llegaste al límite de almacenamiento de tu cuenta. Borra publicaciones antiguas para liberar espacio.');
    if (input.thumbOf) {
      const parent = await tx.mediaItems.get(input.thumbOf);
      if (!parent) throw new NotFoundError('El archivo de esa miniatura no existe.');
      if (parent.ownerId !== ctx.userId) throw new ForbiddenError('Ese archivo no es tuyo.');
      if (parent.purpose !== 'post') throw new ValidationError('Solo las fotos y videos de una publicación llevan miniatura.');
      if ((await tx.mediaItems.list({ ownerId: ctx.userId, thumbOf: input.thumbOf })).length) throw new ConflictError('Ese archivo ya tiene miniatura.');
    }
    const id = randomUUID();
    await deps.media.put({ id, mime: storedMime, bytes: stored, ownerId: ctx.userId });
    const item: MediaItemRecord = {
      id, ownerId: ctx.userId, kind, mime: storedMime, size: stored.length, purpose, createdAt: ctx.now.toISOString(),
      ...(input.thumbOf ? { thumbOf: input.thumbOf } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}),
    };
    await tx.mediaItems.insert(item);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'media.upload', targetType: 'media', targetId: id, detail: { kind, purpose, size: stored.length, ...(stored !== bytes ? { originalSize: bytes.length } : {}) }, createdAt: ctx.now.toISOString() });
    return item;
  });
}

export const mediaUrl = (id: string) => `/api/media/${id}`;

/** Borra los bytes de los archivos (fuera de la transacción: el almacén de archivos no es transaccional). */
export async function discardBytes(deps: Deps, ids: string[]): Promise<void> {
  for (const id of ids) { try { await deps.media.delete(id); } catch { /* ya no estaba */ } }
}

/** Pone o quita la foto de perfil. La anterior se borra. */
export async function setAvatar(deps: Deps, ctx: Ctx, mediaId: string | null): Promise<{ avatarUrl: string | null }> {
  const removed: string[] = [];
  await deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const user = await tx.users.get(ctx.userId);
    if (!user) throw new NotFoundError('Cuenta no encontrada.');
    if (mediaId !== null) {
      const item = await tx.mediaItems.get(mediaId);
      if (!item) throw new NotFoundError('Esa foto no existe.');
      if (item.ownerId !== ctx.userId) throw new ForbiddenError('Esa foto no es tuya.');
      if (item.purpose !== 'avatar' || item.kind !== 'image') throw new ValidationError('Esa imagen no se subió como foto de perfil.');
    }
    const previous = user.avatarId;
    const next = { ...user };
    if (mediaId) next.avatarId = mediaId; else delete next.avatarId;
    await tx.users.update(next);
    if (previous && previous !== mediaId) { await tx.mediaItems.remove(previous); removed.push(previous); }
  });
  await discardBytes(deps, removed);
  return { avatarUrl: mediaId ? mediaUrl(mediaId) : null };
}

/** Quita lo que se subió hace más de un día y no llegó a usarse (publicación abandonada, foto de perfil no elegida). */
export async function cleanOrphanMedia(deps: Deps, now: Date, maxAgeMs: number = ORPHAN_MAX_AGE_MS): Promise<{ removed: number }> {
  const cutoff = now.getTime() - maxAgeMs;
  const stale = await deps.store.tx(async tx => {
    const doomed: string[] = [];
    for (const item of await tx.mediaItems.list()) {
      if (new Date(item.createdAt).getTime() > cutoff) continue;
      const orphan = item.purpose === 'avatar' ? (await tx.users.get(item.ownerId))?.avatarId !== item.id : !item.postId;
      if (!orphan) continue;
      await tx.mediaItems.remove(item.id);
      doomed.push(item.id);
    }
    return doomed;
  });
  await discardBytes(deps, stale);
  return { removed: stale.length };
}
