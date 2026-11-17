'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { api, message } from '@/features/market/service/market-client';
import type { PostPage, PostView } from '../service/posts';
import type { Viewer } from './comments-section';
import { PostCard } from './post-card';
import { PostComposer } from './post-composer';
import { useSingleVideoPlayback } from '@/shared/hooks/use-single-video';

// Muro de un usuario: si es el dueño ve el compositor arriba; todos ven las publicaciones, de la más nueva a la más vieja.
// `focusPostId` (enlace de una notificación) trae esa publicación arriba, destacada y con los comentarios abiertos.
export function PostsFeed({ userId, owner, viewer, ownerName, ownerAvatarUrl, focusPostId }: { userId: string; owner: boolean; viewer: Viewer | null; ownerName: string; ownerAvatarUrl?: string | null; focusPostId?: string }) {
  const [posts, setPosts] = useState<PostView[]>([]), [next, setNext] = useState<string | undefined>(), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [error, setError] = useState('');
  const [focus, setFocus] = useState<PostView | null>(null), [focusMissing, setFocusMissing] = useState(false);
  useSingleVideoPlayback();

  const load = useCallback(async (before?: string) => {
    try {
      const page = await api<PostPage>(`/api/users/${encodeURIComponent(userId)}/posts?limit=10${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      setPosts(current => (before ? [...current, ...page.items.filter(item => !current.some(row => row.id === item.id))] : page.items));
      setNext(page.nextBefore); setError('');
    } catch (e) { setError(message(e, 'No se pudieron cargar las publicaciones.')); }
    finally { setLoading(false); setMore(false); }
  }, [userId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!focusPostId) return;
    let active = true;
    api<PostView>(`/api/posts/${encodeURIComponent(focusPostId)}`)
      .then(post => { if (active && post.authorId === userId) { setFocus(post); window.setTimeout(() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400); } else if (active) setFocusMissing(true); })
      .catch(() => { if (active) setFocusMissing(true); });
    return () => { active = false; };
  }, [focusPostId, userId]);

  // Si el dueño cambia su foto de perfil, sus publicaciones ya cargadas la muestran de inmediato.
  const withAvatar = (post: PostView): PostView => (post.authorId === userId && ownerAvatarUrl !== undefined ? { ...post, authorAvatarUrl: ownerAvatarUrl ?? undefined } : post);
  const shown = posts.filter(post => post.id !== focus?.id).map(withAvatar);
  const patch = (updated: PostView) => { setPosts(current => current.map(row => (row.id === updated.id ? updated : row))); setFocus(current => (current?.id === updated.id ? updated : current)); };
  const remove = (id: string) => { setPosts(current => current.filter(row => row.id !== id)); setFocus(current => (current?.id === id ? null : current)); };

  return (
    <div className="posts-feed">
      {owner && <PostComposer authorName={ownerName} authorAvatarUrl={ownerAvatarUrl} onCreated={post => setPosts(current => [post, ...current])} />}
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {focusMissing && <p className="form-hint"><Icon name="alert" size={14} /> Esa publicación ya no está disponible.</p>}
      {focus && <PostCard post={withAvatar(focus)} viewer={viewer} startOpen highlight onChanged={patch} onDeleted={remove} />}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando publicaciones…</div>
        : shown.length === 0 && !focus ? <div className="empty-state"><div className="empty-icon"><Icon name="list" size={26} /></div><h3>{owner ? 'Aún no has publicado nada' : 'Todavía no hay publicaciones'}</h3><p>{owner ? 'Comparte fotos y videos de tus aves, tu granja o tus novedades.' : 'Cuando este criador publique algo, lo verás aquí.'}</p></div>
        : (
          <>
            {shown.map(post => <PostCard key={post.id} post={post} viewer={viewer} onChanged={patch} onDeleted={remove} />)}
            {next && <button className="btn-secondary posts-more" disabled={more} onClick={() => { setMore(true); void load(next); }}>{more ? 'Cargando…' : 'Ver más publicaciones'}</button>}
          </>
        )}
    </div>
  );
}
