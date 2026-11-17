// Reproducción automática de los reels: solo se reproduce el reel que el usuario está mirando.
// Sin dependencias del navegador: se prueba con node --test.

export const ACTIVE_RATIO = 0.6;

/** Devuelve la clave del reel visible en al menos `min` (por defecto 60 %) con mayor visibilidad; '' si ninguno llega. En empate gana el primero. */
export function pickActiveReel(ratios: ReadonlyMap<string, number>, min = ACTIVE_RATIO): string {
  let best = '', bestRatio = 0;
  for (const [key, raw] of ratios) {
    if (!Number.isFinite(raw)) continue;
    const ratio = Math.min(1, raw);
    if (ratio >= min && ratio > bestRatio) { best = key; bestRatio = ratio; }
  }
  return best;
}

/** Tiempo (ms) que un reel debe seguir siendo el activo antes de montar su reproductor: evita cargar videos al pasar rápido. */
export const DWELL_MS = 280;
