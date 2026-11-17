// Textos del perfil social: sin React ni red, para poder probarlos.

/** «ahora», «hace 5 min», «hace 3 h», «hace 2 d» o la fecha. Redondea hacia abajo. */
export function hace(iso: string, ahora: Date): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: dias > 300 ? 'numeric' : undefined }).replace('.', '');
}

/** La letra del círculo cuando no hay foto: la primera letra o número del alias. */
export function inicial(alias: string): string {
  const letra = [...alias.trim()].find(c => /[\p{L}\p{N}]/u.test(c));
  return (letra ?? '?').toLocaleUpperCase('es-CO');
}

/** «1,2 mil» para cifras grandes; los números chicos se dejan como están. */
export function cifra(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toLocaleString('es-CO')} mil`;
  return `${(Math.floor(n / 100_000) / 10).toLocaleString('es-CO')} M`;
}

/** Etiquetas #así dentro de un texto, para ofrecer buscarlas. */
export function etiquetasDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m => m[1]))];
}

/** Clave corta de un reel para la lista de «ya vistos» que pide el feed «Para ti». Igual que en la API. */
export const claveCorta = (clave: string): string => clave.slice(0, 10);
export const claveDeReel = (tipo: 'post' | 'advertisement', id: string): string => `${tipo === 'post' ? 'p' : 'a'}:${id}`;

/** Empieza a preparar otra página cuando todavía quedan cinco reels fuera de pantalla. */
export function debePrecargarSiguiente(indiceVisible: number, total: number, margen = 5): boolean {
  return total > 0 && indiceVisible >= Math.max(0, total - margen);
}
