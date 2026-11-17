'use client';
import { useEffect } from 'react';

/** Red de seguridad: cuando un <video> empieza a reproducirse, todos los demás de la página se pausan (nunca suenan dos a la vez). */
export function useSingleVideoPlayback() {
  useEffect(() => {
    const onPlay = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLVideoElement)) return;
      for (const video of document.querySelectorAll('video')) if (video !== target && !video.paused) video.pause();
    };
    // El evento «play» no burbujea: se escucha en la fase de captura.
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, []);
}
