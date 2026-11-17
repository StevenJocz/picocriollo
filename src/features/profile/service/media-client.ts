'use client';
import { AVATAR_QUALITY, AVATAR_SIDE, FULL_QUALITY, THUMB_QUALITY, avatarCrop, chooseSmaller, planFull, planThumb } from './image-plan';
import { IMAGE_MIMES } from './media-limits';

// Preparación y subida de fotos y videos en el navegador. Las fotos se comprimen aquí (la mayor parte del ahorro de espacio),
// pero la versión completa se conserva a 0,92 de calidad y hasta 3000 px: se puede ver en cualquier momento sin pérdida apreciable.

export interface UploadedMedia { id: string; kind: 'image' | 'video'; mime: string; size: number; url: string; }
export interface PreparedImage { full: Blob; thumb: Blob; width: number; height: number; }

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la imagen.'))), type, quality));
}

/** WebP si el navegador lo sabe codificar; si devuelve otro tipo (por ejemplo PNG), se usa JPEG de calidad alta. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await canvasBlob(canvas, 'image/webp', quality);
  return webp.type === 'image/webp' ? webp : canvasBlob(canvas, 'image/jpeg', quality);
}

function drawn(source: CanvasImageSource, sw: number, sh: number, width: number, height: number, crop?: { sx: number; sy: number; side: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.imageSmoothingQuality = 'high';
  if (crop) context.drawImage(source, crop.sx, crop.sy, crop.side, crop.side, 0, 0, width, height);
  else context.drawImage(source, 0, 0, sw, sh, 0, 0, width, height);
  return canvas;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!IMAGE_MIMES.includes(file.type)) throw new Error('Usa fotos JPG, PNG o WEBP.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const plan = planFull({ width: bitmap.width, height: bitmap.height, size: file.size, type: file.type });
    let full: Blob = file;
    if (!plan.keepOriginal) {
      const encoded = await encode(drawn(bitmap, bitmap.width, bitmap.height, plan.width, plan.height), FULL_QUALITY);
      full = chooseSmaller({ originalSize: file.size, encodedSize: encoded.size, resized: plan.resize, originalAllowed: true }) === 'original' ? file : encoded;
    }
    const small = planThumb({ width: bitmap.width, height: bitmap.height });
    const thumb = await encode(drawn(bitmap, bitmap.width, bitmap.height, small.width, small.height), THUMB_QUALITY);
    return { full, thumb, width: plan.width, height: plan.height };
  } finally { bitmap.close(); }
}

/** Foto de perfil: cuadrado centrado de 512 px. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!IMAGE_MIMES.includes(file.type)) throw new Error('Usa una foto JPG, PNG o WEBP.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const crop = avatarCrop(bitmap.width, bitmap.height), side = Math.min(AVATAR_SIDE, crop.side);
    return await encode(drawn(bitmap, bitmap.width, bitmap.height, side, side, crop), AVATAR_QUALITY);
  } finally { bitmap.close(); }
}

/** Fotograma del video como miniatura. Si el navegador no puede decodificarlo devuelve null (el video se sube igual). */
export async function videoPoster(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  const url = URL.createObjectURL(file), video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = url;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('video')); window.setTimeout(() => reject(new Error('tiempo agotado')), 8000); });
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    await new Promise<void>(resolve => { video.onseeked = () => resolve(); window.setTimeout(resolve, 3000); });
    if (!video.videoWidth || !video.videoHeight) return null;
    const small = planThumb({ width: video.videoWidth, height: video.videoHeight });
    const blob = await encode(drawn(video, video.videoWidth, video.videoHeight, small.width, small.height), THUMB_QUALITY);
    return { blob, width: video.videoWidth, height: video.videoHeight };
  } catch { return null; }
  finally { URL.revokeObjectURL(url); video.removeAttribute('src'); }
}

export interface UploadParams { purpose?: 'post' | 'avatar'; thumbOf?: string; width?: number; height?: number; }

/** Sube un archivo con el cuerpo en binario y avisa el avance (fetch no informa el progreso de subida; XHR sí). */
export function uploadBlob(blob: Blob, params: UploadParams = {}, onProgress?: (fraction: number) => void): Promise<UploadedMedia> {
  const query = new URLSearchParams({ purpose: params.purpose ?? 'post' });
  if (params.thumbOf) query.set('thumbOf', params.thumbOf);
  if (params.width) query.set('w', String(params.width));
  if (params.height) query.set('h', String(params.height));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/media?${query}`);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      let body: Partial<UploadedMedia> & { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body as UploadedMedia);
      else reject(new Error(body.error || `No se pudo subir el archivo (error ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Sin conexión: no se pudo subir el archivo.'));
    xhr.onabort = () => reject(new Error('La subida se canceló.'));
    xhr.send(blob);
  });
}

export const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
