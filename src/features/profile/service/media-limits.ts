// Límites y formatos de los archivos del perfil. Los usan el servidor (validación) y el navegador (aviso previo).
const MB = 1024 * 1024;
export const IMAGE_LIMIT_BYTES = 12 * MB;
export const VIDEO_LIMIT_BYTES = 60 * MB;
export const AVATAR_LIMIT_BYTES = 3 * MB;
export const THUMB_LIMIT_BYTES = 1.5 * MB;
export const USER_QUOTA_BYTES = 1024 * MB;
/** Tope de la foto que se elige en el teléfono o la cámara antes de comprimirla en el navegador. */
export const PICKED_IMAGE_LIMIT_BYTES = 40 * MB;
export const MAX_MEDIA_PER_POST = 10;
export const MAX_TEXT = 600;
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const COMMENT_MAX = 1000;
