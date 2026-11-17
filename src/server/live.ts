// Canal de avisos en vivo (SSE) por usuario. Solo avisa «hay novedades»; los datos se consultan por la API normal.
// El registro vive en globalThis, igual que el Store, para sobrevivir a la recarga de módulos en desarrollo.
// Límite conocido: es en memoria de UN proceso. Con varias instancias (PostgreSQL) hace falta LISTEN/NOTIFY; mientras tanto
// el cliente conserva el sondeo lento como respaldo.

export const MAX_STREAMS_PER_USER = 5;
export interface Stream { push: () => void; close: () => void; }

const KEY = Symbol.for('pico-criollo.live-streams');
function registry(): Map<string, Stream[]> {
  const holder = globalThis as unknown as Record<symbol, Map<string, Stream[]> | undefined>;
  return (holder[KEY] ??= new Map<string, Stream[]>());
}

/** Registra una conexión del usuario y devuelve la función que la da de baja. La conexión más antigua se cierra al superar el máximo. */
export function subscribe(userId: string, stream: Stream): () => void {
  const streams = registry().get(userId) ?? [];
  streams.push(stream);
  registry().set(userId, streams);
  while (streams.length > MAX_STREAMS_PER_USER) {
    const oldest = streams.shift()!;
    try { oldest.close(); } catch { /* ya estaba cerrada */ }
  }
  return () => {
    const current = registry().get(userId);
    if (!current) return;
    const index = current.indexOf(stream);
    if (index >= 0) current.splice(index, 1);
    if (current.length === 0) registry().delete(userId);
  };
}

export function streamCount(userId: string): number { return registry().get(userId)?.length ?? 0; }

export function publish(userId: string): void {
  for (const stream of [...(registry().get(userId) ?? [])]) {
    try { stream.push(); } catch { /* una conexión rota no debe impedir avisar a las demás */ }
  }
}

/** Un aviso por usuario aunque aparezca repetido. */
export function publishMany(userIds: Iterable<string>): void {
  for (const userId of new Set(userIds)) publish(userId);
}
