'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { PostEmbedView } from '@/features/profile/service/posts';
import { Icon } from './icon';

const START_EVENT = 'pico-criollo:video-start';

// Video de YouTube, TikTok o Instagram dentro de la app. La URL del reproductor la construye el servidor a partir de un id validado;
// aquí además se aísla con `sandbox` y política de referencia estricta.
//  · Modo manual (muro del perfil): vista previa ligera y el reproductor solo se carga al pulsar; al iniciar uno, los demás vuelven a la vista previa.
//  · Modo reel (`active` definido): el reproductor se carga solo mientras el reel es el que se está mirando y se descarga al salir,
//    así nunca suenan dos a la vez. YouTube arranca solo (en silencio hasta que se activa el sonido); TikTok e Instagram deciden su propia reproducción.
export function VideoEmbed({ embed, fill = false, active, soundOn = false }: { embed: PostEmbedView; fill?: boolean; active?: boolean; soundOn?: boolean }) {
  const reelMode = active !== undefined;
  const id = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [manual, setManual] = useState(false), [paused, setPaused] = useState(false);
  const playing = reelMode ? Boolean(active) : manual;
  // En reels, YouTube se muestra «limpio» (sin su interfaz) y se controla con un toque: pausa/reanuda.
  const clean = reelMode && embed.provider === 'youtube';
  useEffect(() => { const timer = window.setTimeout(() => setPaused(false), 0); return () => window.clearTimeout(timer); }, [playing]);

  useEffect(() => {
    if (reelMode) return;
    const onStart = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setManual(false); };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [reelMode, id]);

  // Cambiar el sonido con el video ya en marcha (API de YouTube por mensajes; el parámetro mute cubre el arranque).
  useEffect(() => {
    if (!playing || embed.provider !== 'youtube') return;
    const win = frame.current?.contentWindow;
    if (!win) return;
    const timer = window.setTimeout(() => win.postMessage(JSON.stringify({ event: 'command', func: soundOn ? 'unMute' : 'mute', args: [] }), 'https://www.youtube-nocookie.com'), 700);
    return () => window.clearTimeout(timer);
  }, [soundOn, playing, embed.provider]);

  const poster = embed.provider === 'youtube' ? `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg` : undefined;
  let src = embed.embedUrl;
  if (playing && embed.provider === 'youtube') {
    src += `&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    if (reelMode) src += `${soundOn ? '' : '&mute=1'}&loop=1&playlist=${embed.id}&controls=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0`;
  }

  function togglePause() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func: paused ? 'playVideo' : 'pauseVideo', args: [] }), 'https://www.youtube-nocookie.com');
    setPaused(value => !value);
  }

  function press(event: React.MouseEvent<HTMLButtonElement>) {
    if (reelMode) { event.currentTarget.closest('.reel-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    window.dispatchEvent(new CustomEvent(START_EVENT, { detail: id }));
    setManual(true);
  }

  const link = <a className={`ve-open${fill ? ' ve-open-card' : ''}`} href={embed.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir el video en ${embed.label}`}>Abrir en {embed.label}<Icon name="arrow" size={12} /></a>;
  const player = (
    <div className={`video-embed ve-${embed.provider} ve-${embed.aspect}${fill ? ' ve-fill' : ''}`}>
      {playing && <iframe ref={frame} src={src} title={`Video de ${embed.label}`} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation" />}
      {playing && clean && <button type="button" className={`ve-tap${paused ? ' is-paused' : ''}`} onClick={togglePause} aria-label={paused ? 'Reanudar el video' : 'Pausar el video'}><span className="ve-tap-icon"><Icon name={paused ? 'play' : 'pause'} size={34} /></span></button>}
      {!playing && <button type="button" className="ve-facade" style={poster ? { backgroundImage: `url(${poster})` } : undefined} onClick={press} aria-label={`Reproducir el video de ${embed.label}`}>
        <span className="ve-play"><Icon name="play" size={30} /></span>
        <span className="ve-brand">{embed.label}</span>
      </button>}

    </div>
  );
  // En reels el enlace va fuera del contenedor del video para anclarse a la esquina inferior derecha de la tarjeta.
  return fill ? <>{player}{link}</> : <div className="ve-wrap">{player}{link}</div>;
}
