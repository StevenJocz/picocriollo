'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { api, message } from '@/features/market/service/market-client';
import { UserLink } from '@/features/market/components/user-link';
import { MAX_TEXT } from '../service/media-limits';
import type { PostMediaView, PostView } from '../service/posts';
import { Avatar } from './avatar';
import { VideoEmbed } from '@/shared/components/video-embed';
import { Lightbox } from './lightbox';
import { CommentsSection } from './comments-section';
import type { Viewer } from './comments-section';
import { LikersDialog } from './likers-dialog';
import { ShareDialog } from './share-dialog';

const MAX_SHOWN = 4;

/** Cuadrícula de fotos y videos: 1 grande, 2 en columnas, 3 una grande y dos, 4 o más en 2×2 con «+N». */
export function MediaGrid({ media }: { media: PostMediaView[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  const shown = media.slice(0, MAX_SHOWN), extra = media.length - MAX_SHOWN;
  return (
    <>
      <div className={`media-grid media-grid-${Math.min(shown.length, 4)}`}>
        {shown.map((item, index) => (
          <button key={item.id} type="button" className="media-tile" aria-label={item.kind === 'video' ? `Reproducir video ${index + 1}` : `Ver foto ${index + 1} de ${media.length}`} onClick={() => setOpen(index)}
            style={shown.length === 1 && item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}`, maxHeight: 520 } : undefined}>
            {item.thumbUrl || item.kind === 'image'
              ? <Image src={item.thumbUrl ?? item.url} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 640px" />
              : <span className="media-video-fallback" aria-hidden="true" />}
            {item.kind === 'video' && <span className="media-play" aria-hidden="true"><Icon name="arrow" size={22} /></span>}
            {index === MAX_SHOWN - 1 && extra > 0 && <span className="media-more">+{extra}</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox items={media} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function PostCard({ post, viewer, startOpen = false, highlight = false, onChanged, onDeleted }: { post: PostView; viewer: Viewer | null; startOpen?: boolean; highlight?: boolean; onChanged: (post: PostView) => void; onDeleted: (id: string) => void }) {
  const signedIn = Boolean(viewer);
  const zone = useTimeZone(), dialogs = useDialogs();
  const [showComments, setShowComments] = useState(startOpen), [likers, setLikers] = useState(false), [liking, setLiking] = useState(false), [sharing, setSharing] = useState(false);
  const original = post.shared?.available ? post.shared : undefined;
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(post.text), [busy, setBusy] = useState(false), [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try { onChanged(await api<PostView>(`/api/posts/${post.id}`, { method: 'PATCH', body: { text: draft } })); setEditing(false); }
    catch (e) { setError(message(e, 'No se pudo guardar el cambio.')); }
    finally { setBusy(false); }
  }
  // Me gusta con respuesta inmediata: se actualiza el contador y, si el servidor falla, se revierte.
  async function toggleLike() {
    if (!signedIn) { dialogs.notify('Inicia sesión para dar me gusta.'); return; }
    if (liking) return;
    setLiking(true);
    const target = !post.liked;
    onChanged({ ...post, liked: target, likes: Math.max(0, post.likes + (target ? 1 : -1)) });
    try { const result = await api<{ liked: boolean; likes: number }>(`/api/posts/${post.id}/like`, { method: 'POST', body: { liked: target } }); onChanged({ ...post, liked: result.liked, likes: result.likes }); }
    catch (e) { onChanged(post); dialogs.notify(message(e, 'No se pudo registrar tu me gusta.'), 'error'); }
    finally { setLiking(false); }
  }
  async function remove() {
    if (!(await dialogs.confirm({ title: 'Eliminar publicación', message: 'Se borrarán el texto y todas las fotos y videos. No se puede deshacer.', confirmLabel: 'Eliminar', danger: true }))) return;
    setBusy(true); setError('');
    try { await fetchDelete(post.id); onDeleted(post.id); dialogs.notify('Publicación eliminada.'); }
    catch (e) { setError(message(e, 'No se pudo eliminar.')); setBusy(false); }
  }
  async function report() {
    const reason = await dialogs.ask({ title: 'Denunciar publicación', message: 'Describe qué tiene de inapropiado o engañoso. Un moderador la revisará.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    try { await api('/api/market/reports', { method: 'POST', body: { targetType: 'post', targetId: post.id, reason } }); dialogs.notify('Denuncia enviada. Un moderador la revisará.'); }
    catch (e) { dialogs.notify(message(e, 'No se pudo enviar la denuncia.'), 'error'); }
  }

  return (
    <article className={`panel post-card ${post.hidden ? 'post-hidden' : ''} ${highlight ? 'post-highlight' : ''}`} id={`post-${post.id}`}>
      <header className="post-head">
        <Avatar url={post.authorAvatarUrl} name={post.authorAlias} size={42} />
        <div>
          <strong><UserLink id={post.authorId} name={post.authorAlias} newTab={false} /></strong>
          <small>{formatInZone(post.createdAt, zone, true)}{post.editedAt ? ' · editada' : ''}</small>
        </div>
        <span className="post-actions">
          {post.mine && !editing && !post.hidden && <button className="text-link" disabled={busy} onClick={() => { setDraft(post.text); setEditing(true); }}>Editar</button>}
          {post.mine && <button className="text-link post-danger" disabled={busy} onClick={() => void remove()}>Eliminar</button>}
          {!post.mine && signedIn && !post.authorIsDemo && <button className="text-link" onClick={() => void report()}>Denunciar</button>}
        </span>
      </header>
      {post.authorIsDemo && <p className="demo-post-notice">CUENTA Y PUBLICACIÓN DE MUESTRA · IMAGEN ILUSTRATIVA</p>}
      {post.hidden && <p className="form-hint"><Icon name="alert" size={14} /> La moderación ocultó esta publicación: solo tú la ves.</p>}
      {editing
        ? (
          <div className="post-edit">
            <textarea rows={4} maxLength={MAX_TEXT} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Texto de la publicación" />
            <div className="dialog-actions"><button className="btn-secondary" disabled={busy} aria-busy={busy} onClick={() => setEditing(false)}>Cancelar</button><button className="btn-primary" disabled={busy || (!draft.trim() && post.media.length === 0)} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
          </div>
        )
        : post.text && <p className="post-text">{post.text}</p>}
      {post.shared && (original
        ? (
          <div className="shared-original">
            <div className="shared-original-head">
              <Avatar url={original.authorAvatarUrl} name={original.authorAlias ?? ''} size={30} />
              <span><strong><UserLink id={original.authorId ?? ''} name={original.authorAlias ?? ''} newTab={false} /></strong><small>{original.createdAt ? formatInZone(original.createdAt, zone, true) : ''}</small></span>
            </div>
            {original.text && <p className="post-text">{original.text}</p>}
            {original.embed && <VideoEmbed embed={original.embed} />}
            <MediaGrid media={original.media ?? []} />
          </div>
        )
        : <p className="shared-original shared-gone"><Icon name="info" size={15} /> La publicación original ya no está disponible.</p>)}
      {post.embed && <VideoEmbed embed={post.embed} />}
      <MediaGrid media={post.media} />
      {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
      {!post.hidden && !post.authorIsDemo && (
        <footer className="post-engagement">
          {(post.likes > 0 || post.commentCount > 0) && (
            <div className="post-counts">
              {post.likes > 0 ? <button type="button" onClick={() => setLikers(true)}><Icon name="heart" size={13} /> {post.likes}</button> : <span />}
              {post.commentCount > 0 && <button type="button" onClick={() => setShowComments(value => !value)}>{post.commentCount} {post.commentCount === 1 ? 'comentario' : 'comentarios'}</button>}
            </div>
          )}
          <div className="post-buttons">
            <button type="button" className={post.liked ? 'on' : ''} aria-pressed={post.liked} onClick={() => void toggleLike()}><Icon name="heart" size={16} />Me gusta</button>
            <button type="button" aria-expanded={showComments} onClick={() => setShowComments(value => !value)}><Icon name="chat" size={16} />Comentar</button>
            {(!post.shared || original) && <button type="button" onClick={() => setSharing(true)}><Icon name="share" size={16} />Compartir</button>}
          </div>
        </footer>
      )}
      {showComments && !post.hidden && <CommentsSection postId={post.id} viewer={viewer} onCountChange={delta => onChanged({ ...post, commentCount: Math.max(0, post.commentCount + delta) })} />}
      {likers && <LikersDialog postId={post.id} onClose={() => setLikers(false)} />}
      {sharing && <ShareDialog signedIn={signedIn} onClose={() => setSharing(false)}
        target={original ? { id: original.id, authorId: original.authorId ?? '', authorAlias: original.authorAlias ?? '', own: post.mine || original.authorId === viewer?.id } : { id: post.id, authorId: post.authorId, authorAlias: post.authorAlias, own: post.mine }} />}
    </article>
  );
}

async function fetchDelete(id: string): Promise<void> {
  const response = await fetch(`/api/posts/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.error === 'string' ? body.error : `Error ${response.status}`); }
}
