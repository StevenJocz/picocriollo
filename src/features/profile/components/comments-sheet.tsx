'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/shared/components/icon';
import { CommentsSection } from './comments-section';
import type { Viewer } from './comments-section';

// Hoja inferior con los comentarios de un reel (los mismos hilos que en el perfil).
export function CommentsSheet({ postId, count, viewer, onCountChange, onClose }: { postId: string; count: number; viewer: Viewer | null; onCountChange: (delta: number) => void; onClose: () => void }) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onClose]);
  // Va en <body>: dentro del reel, el recorte y la contención del contenedor harían que el panel fijo no cubra la pantalla.
  return createPortal(
    <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-dialog mini-dialog comments-sheet" role="dialog" aria-modal="true" aria-labelledby="comments-title">
        <div className="dialog-top"><div><h2 id="comments-title">{count} {count === 1 ? 'comentario' : 'comentarios'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        <CommentsSection postId={postId} viewer={viewer} onCountChange={onCountChange} />
      </section>
    </div>,
    document.body,
  );
}
