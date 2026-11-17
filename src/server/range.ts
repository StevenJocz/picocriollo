// Cabecera HTTP Range (un solo rango de bytes), necesaria para que los videos puedan adelantarse y retomarse.
export type RangeResult = { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' };

/** Una cabecera ausente o mal formada se ignora (respuesta completa). Un rango válido pero fuera del archivo es «no satisfacible» (416). */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: 'full' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'full' };
  if (size <= 0) return { kind: 'unsatisfiable' };
  if (match[1] === '') { // últimos N bytes
    const length = Number(match[2]);
    if (length <= 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(size - length, 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || start > end) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end };
}
