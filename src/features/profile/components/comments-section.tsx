'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { api, message } from '@/features/market/service/market-client';
import { UserLink } from '@/features/market/components/user-link';
import { COMMENT_MAX } from '../service/media-limits';
import type { CommentPage, CommentView } from '../service/social';
import { Avatar } from './avatar';

export interface Viewer { id: string; name: string; avatarUrl?: string | null; }

/** «hace 5 min», «hace 3 h», «hace 2 d» y, pasado un mes, la fecha. */
export function ago(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 30 * 86_400) return `hace ${Math.floor(seconds / 86_400)} d`;
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

// Cuadro para escribir: Enter envía, Shift+Enter salto de línea.
function CommentForm({ viewer, placeholder, autoFocus, initial = '', submitLabel = 'Enviar', onSubmit, onCancel }: { viewer: Viewer; placeholder: string; autoFocus?: boolean; initial?: string; submitLabel?: string; onSubmit: (text: string) => Promise<void>; onCancel?: () => void }) {
  const [text, setText] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) field.current?.focus(); }, [autoFocus]);
  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true); setError('');
    try { await onSubmit(text); setText(''); }
    catch (e) { setError(message(e, 'No se pudo enviar.')); }
    finally { setBusy(false); }
  }
  return (
    <div className="comment-form">
      <Avatar url={viewer.avatarUrl} name={viewer.name} size={30} />
      <div className="comment-form-body">
        <textarea
          ref={field} rows={1} maxLength={COMMENT_MAX} value={text} placeholder={placeholder} aria-label={placeholder} disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } else if (e.key === 'Escape' && onCancel) onCancel(); }}
        />
        <div className="comment-form-actions">
          <small className={text.length > COMMENT_MAX - 100 ? 'comment-count-warn' : ''}>{text.length > COMMENT_MAX - 200 ? `${text.length} / ${COMMENT_MAX}` : 'Enter envía · Shift+Enter salto de línea'}</small>
          {onCancel && <button type="button" className="text-link" onClick={onCancel} disabled={busy}>Cancelar</button>}
          <button type="button" className="btn-primary comment-send" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? '…' : submitLabel}</button>
        </div>
        {error && <p className="form-error" role="alert"><Icon name="alert" size={13} />{error}</p>}
      </div>
    </div>
  );
}

interface ItemProps {
  comment: CommentView; viewer: Viewer | null; isReply?: boolean;
  onReply: (target: CommentView) => void; onEdited: (comment: CommentView) => void; onDeleted: (comment: CommentView) => void;
}

function CommentItem({ comment, viewer, isReply, onReply, onEdited, onDeleted }: ItemProps) {
  const dialogs = useDialogs();
  const [editing, setEditing] = useState(false);
  if (comment.deleted) return <li className="comment comment-deleted"><em>Comentario eliminado</em></li>;

  async function remove() {
    if (!(await dialogs.confirm({ title: 'Eliminar comentario', message: comment.parentId || comment.repliesTotal === 0 ? 'Se borrará para todos.' : 'Tiene respuestas: quedará «Comentario eliminado» para no perder la conversación.', confirmLabel: 'Eliminar', danger: true }))) return;
    try { await fetch(`/api/comments/${comment.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(async response => { if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.error === 'string' ? body.error : `Error ${response.status}`); } }); onDeleted(comment); }
    catch (e) { dialogs.notify(message(e, 'No se pudo eliminar.'), 'error'); }
  }
  async function report() {
    const reason = await dialogs.ask({ title: 'Denunciar comentario', message: 'Describe qué tiene de inapropiado. Un moderador lo revisará.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    try { await api('/api/market/reports', { method: 'POST', body: { targetType: 'comment', targetId: comment.id, reason } }); dialogs.notify('Denuncia enviada. Un moderador la revisará.'); }
    catch (e) { dialogs.notify(message(e, 'No se pudo enviar la denuncia.'), 'error'); }
  }

  return (
    <li className={`comment ${isReply ? 'comment-reply' : ''} ${comment.hidden ? 'comment-hidden' : ''}`} id={`comment-${comment.id}`}>
      <Avatar url={comment.authorAvatarUrl} name={comment.authorAlias} size={isReply ? 26 : 30} />
      <div className="comment-main">
        {editing && viewer
          ? <CommentForm viewer={viewer} initial={comment.text} placeholder="Edita tu comentario" autoFocus submitLabel="Guardar" onCancel={() => setEditing(false)} onSubmit={async text => { onEdited(await api<CommentView>(`/api/comments/${comment.id}`, { method: 'PATCH', body: { text } })); setEditing(false); }} />
          : (
            <div className="comment-bubble">
              <strong><UserLink id={comment.authorId} name={comment.authorAlias} /></strong>
              {comment.hidden && <small className="comment-flag">La moderación lo ocultó: solo tú lo ves</small>}
              <p>{comment.replyTo && <span className="comment-mention">{comment.replyTo.alias} </span>}{comment.text}</p>
            </div>
          )}
        {!editing && (
          <div className="comment-meta">
            <span>{ago(comment.createdAt)}{comment.editedAt ? ' · editado' : ''}</span>
            {viewer && !comment.hidden && <button type="button" onClick={() => onReply(comment)}>Responder</button>}
            {comment.mine && !comment.hidden && <button type="button" onClick={() => setEditing(true)}>Editar</button>}
            {comment.canDelete && <button type="button" className="post-danger" onClick={() => void remove()}>Eliminar</button>}
            {viewer && !comment.mine && <button type="button" onClick={() => void report()}>Denunciar</button>}
          </div>
        )}
      </div>
    </li>
  );
}

// Comentarios de una publicación: principales (más viejos primero) con hilos de respuestas de un solo nivel.
export function CommentsSection({ postId, viewer, onCountChange }: { postId: string; viewer: Viewer | null; onCountChange: (delta: number) => void }) {
  const [items, setItems] = useState<CommentView[]>([]), [next, setNext] = useState<string | undefined>(), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [error, setError] = useState('');
  const [replying, setReplying] = useState<{ rootId: string; target: CommentView } | null>(null), [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async (after?: string, replace = false) => {
    try {
      const page = await api<CommentPage>(`/api/posts/${postId}/comments?limit=10${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      setItems(current => (after && !replace ? [...current, ...page.items.filter(item => !current.some(row => row.id === item.id))] : page.items));
      setNext(page.nextAfter); setError('');
    } catch (e) { setError(message(e, 'No se pudieron cargar los comentarios.')); }
    finally { setLoading(false); setMore(false); }
  }, [postId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  // Con el canal en vivo, un comentario nuevo de otra persona aparece sin recargar (se recarga lo ya cargado).
  useEffect(() => {
    const onLive = () => void load(undefined, true);
    window.addEventListener('pico-live', onLive);
    return () => window.removeEventListener('pico-live', onLive);
  }, [load]);

  const patchThread = (rootId: string, change: (root: CommentView) => CommentView) => setItems(current => current.map(row => (row.id === rootId ? change(row) : row)));

  async function expand(rootId: string) {
    try { const result = await api<{ items: CommentView[] }>(`/api/comments/${rootId}/replies`); patchThread(rootId, root => ({ ...root, replies: result.items, repliesTotal: result.items.length })); setExpanded(current => ({ ...current, [rootId]: true })); }
    catch (e) { setError(message(e, 'No se pudieron cargar las respuestas.')); }
  }

  async function addTop(text: string) {
    const created = await api<CommentView>(`/api/posts/${postId}/comments`, { method: 'POST', body: { text } });
    setItems(current => [...current, created]); onCountChange(1);
  }
  async function addReply(text: string) {
    if (!replying) return;
    await api<CommentView>(`/api/posts/${postId}/comments`, { method: 'POST', body: { text, parentId: replying.target.id } });
    const rootId = replying.rootId;
    setReplying(null); onCountChange(1);
    await expand(rootId); // trae el hilo completo, con la respuesta nueva al final
  }

  function edited(updated: CommentView) {
    if (updated.parentId) patchThread(updated.parentId, root => ({ ...root, replies: root.replies?.map(row => (row.id === updated.id ? updated : row)) }));
    else setItems(current => current.map(row => (row.id === updated.id ? { ...updated, replies: row.replies, repliesTotal: row.repliesTotal } : row)));
  }
  function deleted(gone: CommentView) {
    onCountChange(-1);
    if (gone.parentId) patchThread(gone.parentId, root => ({ ...root, replies: root.replies?.filter(row => row.id !== gone.id), repliesTotal: Math.max(0, root.repliesTotal - 1) }));
    else setItems(current => (gone.repliesTotal > 0 ? current.map(row => (row.id === gone.id ? { ...row, deleted: true, text: '', canDelete: false } : row)) : current.filter(row => row.id !== gone.id)));
  }

  return (
    <section className="comments" aria-label="Comentarios">
      {error && <div className="form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
      {loading ? <div className="loading-state comments-loading"><span className="spinner" />Cargando comentarios…</div> : (
        <>
          {items.length === 0 && <p className="comments-empty">Aún no hay comentarios. ¡Sé la primera persona en comentar!</p>}
          <ul className="comment-list">
            {items.map(root => {
              const shown = root.replies ?? [], hiddenCount = root.repliesTotal - shown.length;
              return (
                <li key={root.id} className="comment-thread">
                  <ul className="comment-list comment-thread-root">
                    <CommentItem comment={root} viewer={viewer} onReply={target => setReplying({ rootId: root.id, target })} onEdited={edited} onDeleted={deleted} />
                  </ul>
                  {(shown.length > 0 || hiddenCount > 0 || replying?.rootId === root.id) && (
                    <ul className="comment-list comment-replies">
                      {hiddenCount > 0 && !expanded[root.id] && <li><button type="button" className="comment-more" onClick={() => void expand(root.id)}>Ver {hiddenCount} {hiddenCount === 1 ? 'respuesta más' : 'respuestas más'}</button></li>}
                      {shown.map(reply => <CommentItem key={reply.id} comment={reply} viewer={viewer} isReply onReply={target => setReplying({ rootId: root.id, target })} onEdited={edited} onDeleted={deleted} />)}
                      {viewer && replying?.rootId === root.id && (
                        <li>
                          <p className="comment-replying">Respondiendo a <strong>{replying.target.authorAlias}</strong></p>
                          <CommentForm viewer={viewer} placeholder={`Responde a ${replying.target.authorAlias}…`} autoFocus submitLabel="Responder" onCancel={() => setReplying(null)} onSubmit={addReply} />
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {next && <button type="button" className="comment-more" disabled={more} onClick={() => { setMore(true); void load(next); }}>{more ? 'Cargando…' : 'Ver más comentarios'}</button>}
          {viewer ? <CommentForm viewer={viewer} placeholder="Escribe un comentario…" onSubmit={addTop} /> : <p className="comments-login">Inicia sesión para comentar.</p>}
        </>
      )}
    </section>
  );
}
