import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Texto } from '@/components/Texto';
import type { Post } from './servicio';

type Player = { playVideo(): void; pauseVideo(): void; mute(): void; destroy(): void };
type YouTube = { Player: new (element: HTMLElement, options: { videoId: string; width: string; height: string; playerVars: Record<string, string | number>; events: { onReady(e: { target: Player }): void; onError(): void } }) => Player };
type Ventana = Window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
let apiLista: Promise<YouTube> | null = null;
function cargarApi() {
  const w = window as Ventana;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiLista) return apiLista;
  apiLista = new Promise<YouTube>((resolve, reject) => {
    const anterior = w.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(Error('Tiempo de espera del reproductor')), 15000);
    w.onYouTubeIframeAPIReady = () => { anterior?.(); clearTimeout(timer); w.YT ? resolve(w.YT) : reject(Error('Reproductor no disponible')); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('No se pudo preparar el reproductor')); };
    document.head.appendChild(script);
  }).catch(e => { apiLista = null; throw e; });
  return apiLista;
}

export function VideoReel({ video, activo, precargar = activo }: { video: NonNullable<Post['embed']>; activo: boolean; precargar?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const visible = useRef(activo); visible.current = activo;
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(false);
  const id = video.provider === 'youtube' ? video.id : null;
  useEffect(() => {
    if (!precargar || !id || !host.current) return;
    let cancelado = false;
    setListo(false); setError(false);
    void cargarApi().then(yt => {
      if (cancelado || !host.current) return;
      const contenedor = document.createElement('div'); host.current.appendChild(contenedor);
      player.current = new yt.Player(contenedor, { videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, origin: window.location.origin },
        events: { onReady: e => { if (cancelado) return; e.target.mute(); setListo(true); if (visible.current) e.target.playVideo(); }, onError: () => { if (!cancelado) setError(true); } },
      });
    }).catch(() => { if (!cancelado) setError(true); });
    return () => { cancelado = true; player.current?.destroy(); player.current = null; };
  }, [id, precargar]);
  useEffect(() => { if (listo) { if (activo) player.current?.playVideo(); else player.current?.pauseVideo(); } }, [activo, listo]);
  return <>
    <div ref={host} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', visibility: listo && !error ? 'visible' : 'hidden' }} />
    {activo && (!listo || error) && <View style={{ position: 'absolute', top: '35%', alignSelf: 'center', alignItems: 'center', gap: 12 }}>
      {error || !id ? <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ color: 'white' }}>Abrir video en {video.label}</a> : <><ActivityIndicator color="white" /><Texto style={{ color: 'white' }}>Preparando video…</Texto></>}
    </View>}
  </>;
}
