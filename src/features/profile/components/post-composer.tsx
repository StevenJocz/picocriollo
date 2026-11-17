'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { api, message } from '@/features/market/service/market-client';
import { MAX_VIDEO_SECONDS } from '../service/video-policy';
import { MAX_MEDIA_PER_POST, MAX_TEXT, IMAGE_MIMES, PICKED_IMAGE_LIMIT_BYTES, VIDEO_LIMIT_BYTES, VIDEO_MIMES } from '../service/media-limits';
import { formatBytes, prepareImage, uploadBlob, videoPoster } from '../service/media-client';
import type { PostView } from '../service/posts';
import { Avatar } from './avatar';
import { PROVIDER_LABELS, describeUnshareableLink, parseShareableVideoLink } from '../service/video-links';

interface Attachment { key: string; file: File; kind: 'image' | 'video'; preview: string; progress: number; state: 'ready' | 'uploading' | 'done' | 'error'; mediaId?: string; error?: string; note?: string; }

const newKey = () => Math.random().toString(36).slice(2);

// Compositor del muro: texto, fotos y videos. Cada archivo se sube con su avance; si algo falla se puede reintentar sin repetir lo ya subido.
export function PostComposer({ authorName, authorAvatarUrl, onCreated }: { authorName: string; authorAvatarUrl?: string | null; onCreated: (post: PostView) => void }) {
  const [text, setText] = useState(''), [items, setItems] = useState<Attachment[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notes, setNotes] = useState('');
  const [showLink, setShowLink] = useState(false), [link, setLink] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const linkText = link.trim(), detected = linkText ? parseShareableVideoLink(linkText) : null;
  const previews = useRef<string[]>([]);
  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url); }, []);

  function patch(key: string, change: Partial<Attachment>) { setItems(current => current.map(item => (item.key === key ? { ...item, ...change } : item))); }

  function add(files: FileList | null) {
    if (!files?.length) return;
    const skipped: string[] = [];
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      const image = IMAGE_MIMES.includes(file.type), video = VIDEO_MIMES.includes(file.type);
      if (!image && !video) { skipped.push(`«${file.name}»: formato no permitido`); continue; }
      if (image && file.size > PICKED_IMAGE_LIMIT_BYTES) { skipped.push(`«${file.name}»: la foto pesa más de 40 MB`); continue; }
      if (video && file.size > VIDEO_LIMIT_BYTES) { skipped.push(`«${file.name}»: el video pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(VIDEO_LIMIT_BYTES)}`); continue; }
      if (items.length + next.length >= MAX_MEDIA_PER_POST) { skipped.push(`Máximo ${MAX_MEDIA_PER_POST} archivos por publicación`); break; }
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      next.push({ key: newKey(), file, kind: image ? 'image' : 'video', preview, progress: 0, state: 'ready' });
    }
    setNotes(skipped.join('. '));
    if (next.length) setItems(current => [...current, ...next]);
    if (input.current) input.current.value = '';
  }

  async function upload(item: Attachment): Promise<string> {
    if (item.mediaId) return item.mediaId;
    patch(item.key, { state: 'uploading', progress: 0, error: undefined });
    try {
      let id: string;
      if (item.kind === 'image') {
        const prepared = await prepareImage(item.file);
        const full = await uploadBlob(prepared.full, { purpose: 'post', width: prepared.width, height: prepared.height }, f => patch(item.key, { progress: f * 0.9 }));
        await uploadBlob(prepared.thumb, { thumbOf: full.id }, undefined);
        id = full.id;
      } else {
        const video = await uploadBlob(item.file, { purpose: 'post' }, f => patch(item.key, f >= 1 ? { progress: 0.96, note: 'Optimizando video…' } : { progress: f * 0.95, note: undefined }));
        patch(item.key, { note: undefined });
        const poster = await videoPoster(item.file);
        if (poster) { try { await uploadBlob(poster.blob, { thumbOf: video.id, width: poster.width, height: poster.height }); } catch { /* el video queda sin póster */ } }
        id = video.id;
      }
      patch(item.key, { state: 'done', progress: 1, mediaId: id });
      return id;
    } catch (e) { patch(item.key, { state: 'error', error: message(e, 'No se pudo subir.') }); throw e; }
  }

  async function publish() {
    if (busy) return;
    if (linkText && !detected) { setError(describeUnshareableLink(linkText)); return; }
    if (!text.trim() && items.length === 0 && !detected) { setError('Escribe algo o agrega una foto, un video o un enlace de video.'); return; }
    setBusy(true); setError('');
    try {
      const ids: string[] = [];
      for (const item of items) ids.push(await upload(item));
      const post = await api<PostView>('/api/posts', { method: 'POST', body: { text, mediaIds: ids, ...(detected ? { videoUrl: linkText } : {}) } });
      onCreated(post);
      for (const url of previews.current) URL.revokeObjectURL(url);
      previews.current = [];
      setText(''); setItems([]); setNotes(''); setLink(''); setShowLink(false);
    } catch (e) { setError(message(e, 'No se pudo publicar.')); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel post-composer" aria-label="Crear publicación">
      <div className="post-composer-top">
        <Avatar url={authorAvatarUrl} name={authorName} size={42} />
        <textarea rows={3} maxLength={MAX_TEXT} value={text} onChange={e => setText(e.target.value)} placeholder="¿Qué quieres compartir con tus clientes y otros criadores?" aria-label="Texto de la publicación" disabled={busy} />
      </div>
      {items.length > 0 && (
        <ul className="attach-list">
          {items.map(item => (
            <li key={item.key} className={`attach attach-${item.state}`}>
              {item.kind === 'image'
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.preview} alt="" />
                      : <video src={item.preview} muted preload="metadata" />}
              <span className="attach-meta">{item.note ?? `${item.kind === 'video' ? 'Video' : 'Foto'} · ${formatBytes(item.file.size)}`}</span>
              {item.state === 'uploading' && <span className="attach-bar" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></span>}
              {item.state === 'done' && <span className="attach-ok" aria-label="Subido"><Icon name="check" size={14} /></span>}
              {item.state === 'error' && <span className="attach-err" role="alert">{item.error}</span>}
              {!busy && <button type="button" className="attach-remove" aria-label="Quitar archivo" onClick={() => setItems(current => current.filter(row => row.key !== item.key))}><Icon name="close" size={13} /></button>}
            </li>
          ))}
        </ul>
      )}
      {showLink && (
        <div className="post-link-row">
          <label className="form-field"><span>Enlace de un video de YouTube</span>
            <input type="url" inputMode="url" autoComplete="off" maxLength={500} value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" disabled={busy} data-autofocus />
          </label>
          {linkText && (detected
            ? <p className="link-status link-ok" role="status"><Icon name="check" size={14} />Listo: se mostrará como video de {PROVIDER_LABELS[detected.provider]} dentro de la app.</p>
            : <p className="link-status link-bad" role="alert"><Icon name="alert" size={14} />{describeUnshareableLink(linkText)}</p>)}
        </div>
      )}
      {notes && <p className="photo-picker-note" role="status">{notes}</p>}
      {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
      <div className="post-composer-actions">
        <button type="button" className="btn-secondary" disabled={busy || items.length >= MAX_MEDIA_PER_POST || Boolean(linkText)} onClick={() => input.current?.click()}><Icon name="plus" size={15} />Foto o video</button>
        <button type="button" className={`btn-secondary${showLink ? ' is-on' : ''}`} disabled={busy || items.length > 0} aria-pressed={showLink} onClick={() => setShowLink(open => !open)}><Icon name="play" size={15} />Enlace de video</button>
        <input ref={input} type="file" multiple hidden accept={[...IMAGE_MIMES, ...VIDEO_MIMES].join(',')} onChange={e => add(e.target.files)} />
        <small className="field-hint">{items.length} de {MAX_MEDIA_PER_POST} · las fotos y los videos se comprimen sin perder calidad apreciable · videos hasta {MAX_VIDEO_SECONDS / 60} min y {formatBytes(VIDEO_LIMIT_BYTES)}</small>
        <button type="button" className="btn-primary" disabled={busy || (!text.trim() && items.length === 0 && !detected)} aria-busy={busy} onClick={() => void publish()}>{busy ? 'Publicando…' : items.some(item => item.state === 'error') ? 'Reintentar' : 'Publicar'}</button>
      </div>
    </section>
  );
}
