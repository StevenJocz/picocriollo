/** Publica solo elementos preparados; una descarga fallida no bloquea las demás. */
export async function prepararCola<T>(items: T[], preparar: (item: T) => Promise<void>, listo: (item: T) => void, concurrencia = 3) {
  let indice = 0;
  const fallidos: T[] = [];
  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, async () => {
    while (indice < items.length) {
      const item = items[indice++];
      try { await preparar(item); listo(item); } catch { fallidos.push(item); }
    }
  }));
  return fallidos;
}

const videosCalientes = new Map<string, Promise<void>>();

/** Descarga solo el inicio del MP4 para que el navegador ya tenga metadatos y cuadros iniciales al mostrarlo. */
export function calentarVideo(url: string, solicitar: typeof fetch = fetch): Promise<void> {
  const anterior = videosCalientes.get(url);
  if (anterior) return anterior;
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), 15000);
  const carga = solicitar(url, {
    headers: { Range: 'bytes=0-2097151' },
    cache: 'force-cache',
    signal: controlador.signal,
  }).then(async respuesta => {
    if (!respuesta.ok) throw Error(`Video no disponible (${respuesta.status})`);
    await respuesta.arrayBuffer();
  }).finally(() => clearTimeout(reloj)).catch(error => {
    videosCalientes.delete(url);
    throw error;
  });
  if (videosCalientes.size >= 100) videosCalientes.delete(videosCalientes.keys().next().value!);
  videosCalientes.set(url, carga);
  return carga;
}

/** Con una portada disponible no exponemos el estado de búfer al usuario. */
export function mostrarCargaVideo(portada: string | null | undefined, estado: string) {
  return !portada && estado !== 'error';
}
