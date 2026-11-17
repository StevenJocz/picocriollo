'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import type { PostMediaView } from '../service/posts';
import { formatBytes } from '../service/media-client';

// Visor a pantalla completa: muestra siempre la versión COMPLETA (la miniatura solo se usa en el muro).
export function Lightbox({ items, start, onClose }: { items: PostMediaView[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const close = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const go = useCallback((step: number) => setIndex(current => (current + step + items.length) % items.length), [items.length]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && items.length > 1) go(1);
      else if (event.key === 'ArrowLeft' && items.length > 1) go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus?.(); };
  }, [go, items.length, onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Visor de fotos y videos" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <button ref={close} className="lightbox-close" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={22} /></button>
      {items.length > 1 && <button className="lightbox-nav lightbox-prev" aria-label="Anterior" onClick={() => go(-1)}>‹</button>}
      <figure className="lightbox-stage">
        {item.kind === 'video'
          ? <video key={item.id} src={item.url} poster={item.thumbUrl} controls autoPlay playsInline preload="metadata" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img key={item.id} src={item.url} alt={`Foto ${index + 1} de ${items.length}`} />}
        <figcaption>{index + 1} de {items.length} · {formatBytes(item.size)}{item.width && item.height ? ` · ${item.width}×${item.height}` : ''} · <a href={item.url} target="_blank" rel="noopener noreferrer">Abrir original</a></figcaption>
      </figure>
      {items.length > 1 && <button className="lightbox-nav lightbox-next" aria-label="Siguiente" onClick={() => go(1)}>›</button>}
    </div>
  );
}
