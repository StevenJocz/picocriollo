// Política de los videos propios que se suben a la plataforma. Sin dependencias: la usan el servidor y el navegador.

/** Duración máxima de un video propio. Los más largos se rechazan antes de ocupar espacio. */
export const MAX_VIDEO_SECONDS = 120;

export interface TranscodedVideo { bytes: Uint8Array; mime: 'video/mp4'; width: number; height: number; seconds: number; }

/** Convierte un video subido en un MP4 liviano (H.264 + AAC, hasta 720p, listo para reproducir sin esperar la descarga completa). */
export interface VideoTranscoder {
  transcode(bytes: Uint8Array, mime: string): Promise<TranscodedVideo>;
}
