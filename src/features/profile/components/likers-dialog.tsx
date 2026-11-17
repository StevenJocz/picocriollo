'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { api, message } from '@/features/market/service/market-client';
import { UserLink } from '@/features/market/components/user-link';
import { Avatar } from './avatar';

interface Likers { total: number; users: { id: string; alias: string; avatarUrl?: string }[]; }

// Quién dio me gusta a una publicación.
export function LikersDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [data, setData] = useState<Likers | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<Likers>(`/api/posts/${postId}/likes`).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(message(e, 'No se pudo cargar la lista.')); });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { active = false; document.removeEventListener('keydown', onKey); };
  }, [postId, onClose]);
  return (
    <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-dialog mini-dialog" role="dialog" aria-modal="true" aria-label="Personas a las que les gusta">
        <div className="dialog-top"><div><h2>Me gusta</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
        {!data && !error && <div className="loading-state"><span className="spinner" />Cargando…</div>}
        {data && (
          <>
            <ul className="likers-list">{data.users.map(user => <li key={user.id}><Avatar url={user.avatarUrl} name={user.alias} size={36} /><UserLink id={user.id} name={user.alias} /></li>)}</ul>
            {data.total > data.users.length && <p className="mini-dialog-hint">y {data.total - data.users.length} más</p>}
          </>
        )}
      </section>
    </div>
  );
}
