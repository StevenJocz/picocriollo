// Decisiones de compresión de fotos (puras, sin DOM) para poder probarlas. El navegador las aplica en `media-client.ts`.
//
// Criterio: la foto completa se guarda «visualmente sin pérdida» (WebP calidad 0,92, hasta 3000 px de lado mayor) y siempre queda
// disponible a ese tamaño. Si el original ya es liviano y está comprimido (JPG/WEBP de hasta ~1,2 MB) se conserva TAL CUAL para no
// perder nada más. Además se guarda una miniatura pequeña para que el muro cargue rápido.

export const FULL_MAX_SIDE = 3000;
export const THUMB_MAX_SIDE = 720;
export const AVATAR_SIDE = 512;
export const FULL_QUALITY = 0.92;
export const THUMB_QUALITY = 0.82;
export const AVATAR_QUALITY = 0.9;
export const KEEP_ORIGINAL_BYTES = 1_200_000;

export interface ImageInfo { width: number; height: number; size: number; type: string; }
export interface FullPlan { width: number; height: number; resize: boolean; keepOriginal: boolean; }

const scaled = (width: number, height: number, max: number) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), resize: scale < 1 };
};

export function planFull(info: ImageInfo): FullPlan {
  const { width, height, resize } = scaled(info.width, info.height, FULL_MAX_SIDE);
  const compressedFormat = info.type === 'image/jpeg' || info.type === 'image/webp';
  return { width, height, resize, keepOriginal: !resize && compressedFormat && info.size <= KEEP_ORIGINAL_BYTES };
}

export function planThumb(info: Pick<ImageInfo, 'width' | 'height'>): { width: number; height: number } {
  const { width, height } = scaled(info.width, info.height, THUMB_MAX_SIDE);
  return { width, height };
}

/** Al re-codificar sin reducir el tamaño nunca se debe empeorar: si queda más pesado que el original, se conserva el original. */
export function chooseSmaller(input: { originalSize: number; encodedSize: number; resized: boolean; originalAllowed: boolean }): 'original' | 'encoded' {
  if (input.resized || !input.originalAllowed) return 'encoded';
  return input.encodedSize < input.originalSize ? 'encoded' : 'original';
}

/** Cuadrado centrado para la foto de perfil. */
export function avatarCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}
