'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { api, message } from '@/features/market/service/market-client';
import { MAX_TEXT } from '../service/media-limits';
import type { PostView } from '../service/posts';

export interface ShareTarget { id: string; authorId: string; authorAlias: string; /** El reel es de quien mira: no se comparte en su propio perfil. */ own: boolean; /** Reel de muestra: solo se puede copiar el enlace. */ sample?: boolean; /** Enlace propio (avisos del mercado); implica que solo se comparte el enlace. */ href?: string; }

/** Enlace público al reel original (abre el perfil del autor y destaca la publicación). */
const linkOf = (target: ShareTarget) => target.href ? `${window.location.origin}${target.href}` : `${window.location.origin}/mercado/vendedor/${encodeURIComponent(target.authorId)}?post=${encodeURIComponent(target.id)}`;

// Hoja para compartir un reel: en el perfil propio (con un comentario opcional) o como enlace (copiar o enviar a otras apps).
export function ShareDialog({ target, signedIn, onClose, onShared }: { target: ShareTarget; signedIn: boolean; onClose: () => void; onShared?: (post: PostView) => void }) {
  const dialogs = useDialogs();
  const [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLElement>(null);
  const canRepost = signedIn && !target.own && !target.sample && !target.href;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('textarea, .share-primary')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onClose]);

  async function repost() {
    setBusy(true); setError('');
    try {
      const post = await api<PostView>(`/api/posts/${target.id}/share`, { method: 'POST', body: { comment: comment.trim() } });
      dialogs.notify('Compartiste el reel en tu perfil.');
      onShared?.(post); onClose();
    } catch (cause) { setError(message(cause, 'No se pudo compartir el reel.')); setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(linkOf(target)); dialogs.notify('Enlace copiado.'); onClose(); }
    catch { setError('No se pudo copiar. Mantén pulsado el enlace para copiarlo.'); }
  }
  async function send() {
    try { await navigator.share({ title: `${target.href ? 'Aviso' : 'Reel'} de ${target.authorAlias} en Pico Criollo`, url: linkOf(target) }); onClose(); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('No se pudo abrir el menú de compartir.'); }
  }

  return (
    <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-dialog mini-dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={box}>
        <div className="dialog-top"><div><h2 id="share-title">{target.href ? 'Compartir aviso' : 'Compartir reel'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        <p className="mini-dialog-text">{target.href ? 'Aviso del mercado de' : 'Reel de'} <strong>{target.authorAlias}</strong>. {target.href ? 'Envía el enlace para que lo vean en el mercado.' : canRepost ? 'Se publicará en tu perfil con el crédito al autor original.' : target.own ? 'Es tu propia publicación: puedes enviar el enlace.' : target.sample ? 'Es una publicación de muestra: solo se puede enviar el enlace.' : 'Inicia sesión para compartirlo en tu perfil.'}</p>
        {canRepost && (
          <label className="form-field">
            <span>Tu comentario (opcional)</span>
            <textarea rows={3} maxLength={MAX_TEXT} value={comment} placeholder="Añade unas palabras…" onChange={event => setComment(event.target.value)} />
          </label>
        )}
        {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
        <div className="share-actions">
          {canRepost && <button type="button" className="btn-primary share-primary" disabled={busy} aria-busy={busy} onClick={() => void repost()}><Icon name="share" size={16} />{busy ? 'Compartiendo…' : 'Compartir en mi perfil'}</button>}
          <button type="button" className="btn-secondary" onClick={() => void copy()}><Icon name="copy" size={16} />Copiar enlace</button>
          {canNativeShare && <button type="button" className="btn-secondary" onClick={() => void send()}><Icon name="arrow" size={16} />Enviar a otras apps</button>}
        </div>
      </section>
    </div>
  );
}
