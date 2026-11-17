import type { Ave } from './modelos.ts';

/** Cada ave aparece una vez por recorrido, incluso si hay parentesco compartido o datos antiguos cíclicos. */
export function generaciones(aves: Ave[], raiz: string, sentido: 'ascendencia' | 'descendencia'): Ave[][] {
  const porId = new Map(aves.map(a => [a.id, a]));
  const vistas = new Set([raiz]);
  const filas: Ave[][] = [];
  let actual = [raiz];
  while (actual.length) {
    const ids = sentido === 'ascendencia'
      ? actual.flatMap(id => [porId.get(id)?.motherId, porId.get(id)?.fatherId].filter((p): p is string => !!p))
      : aves.filter(a => actual.includes(a.motherId ?? '') || actual.includes(a.fatherId ?? '')).map(a => a.id);
    const fila: Ave[] = [];
    for (const id of ids) {
      const ave = porId.get(id);
      if (ave && !vistas.has(id)) { vistas.add(id); fila.push(ave); }
    }
    if (!fila.length) break;
    filas.push(fila);
    actual = fila.map(a => a.id);
  }
  return filas;
}

export function hermanos(aves: Ave[], ave: Ave): Ave[] {
  return aves.filter(a => a.id !== ave.id && ((!!ave.motherId && a.motherId === ave.motherId) || (!!ave.fatherId && a.fatherId === ave.fatherId)));
}

export function nombreGeneracion(indice: number, ascendencia = false): string {
  return (ascendencia ? ['Padres', 'Abuelos', 'Bisabuelos'] : ['Hijos', 'Nietos', 'Bisnietos'])[indice]
    ?? `${ascendencia ? 'Ascendencia' : 'Descendencia'} · ${indice + 1}ª generación`;
}
