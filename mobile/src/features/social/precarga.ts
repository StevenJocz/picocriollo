import { Image } from 'react-native';
import { urlAbsoluta } from '@/api/cliente';
import { fotosPublicacion } from '@/features/mercado/fotos';
import type { ElementoReel } from './servicio';
import { calentarVideo } from './colaPrecarga';

const cache = new Map<string, Promise<void>>();
function foto(url: string): Promise<void> {
  const anterior = cache.get(url); if (anterior) return anterior;
  const carga = new Promise<void>((resolve, reject) => {
    const reloj = setTimeout(() => reject(Error('La foto tardó demasiado')), 15000);
    // React Native Web resuelve sin valor al cargar; nativo devuelve un booleano.
    Image.prefetch(url).then(ok => { clearTimeout(reloj); ok !== false ? resolve() : reject(Error('Foto no disponible')); }, e => { clearTimeout(reloj); reject(e); });
  }).catch(e => { cache.delete(url); throw e; });
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(url, carga); return carga;
}
export async function prepararReel(item: ElementoReel) {
  const post = item.post?.shared?.available ? item.post.shared : item.post;
  const urls = [...(post?.media ?? []).filter(m => m.kind === 'image' || m.thumbUrl).map(m => urlAbsoluta(m.kind === 'image' ? m.url : m.thumbUrl!)), ...fotosPublicacion(item.listing?.snapshot)].filter((u): u is string => !!u);
  const videos = (post?.media ?? []).filter(m => m.kind === 'video').map(m => urlAbsoluta(m.url)).filter((u): u is string => !!u);
  await Promise.all([
    ...[...new Set(urls)].map(foto),
    ...[...new Set(videos)].map(url => calentarVideo(url)),
  ]);
}
