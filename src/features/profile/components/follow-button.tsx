'use client';

import { useEffect, useState } from 'react';

export function FollowButton({ targetId, viewerId, initialFollowing, compact = false, onFollowersChange }: {
  targetId: string; viewerId: string; initialFollowing: boolean; compact?: boolean; onFollowersChange?: (count: number) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const isSelf = targetId === viewerId;
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ targetId: string; following: boolean; followers: number }>).detail;
      if (detail?.targetId !== targetId) return;
      setFollowing(detail.following);
      onFollowersChange?.(detail.followers);
    };
    window.addEventListener('pico-criollo:follow-changed', sync);
    return () => window.removeEventListener('pico-criollo:follow-changed', sync);
  }, [targetId, onFollowersChange]);
  async function toggle() {
    if (busy) return;
    const next = !following;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(targetId)}/follow`, {
        method: next ? 'POST' : 'DELETE', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo actualizar el seguimiento.');
      setFollowing(body.following === true);
      if (typeof body.followers === 'number') onFollowersChange?.(body.followers);
      window.dispatchEvent(new CustomEvent('pico-criollo:follow-changed', { detail: { targetId, following: body.following === true, followers: body.followers } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el seguimiento.'); }
    finally { setBusy(false); }
  }
  if (isSelf) return null;
  return (
    <span className={`follow-control ${compact ? 'follow-control-compact' : ''}`}>
      <button type="button" className={`follow-button ${following ? 'is-following' : ''}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()}>
        {busy ? '…' : following ? 'Siguiendo' : 'Seguir'}
      </button>
      {error && <small className="follow-error" role="status">{error}</small>}
    </span>
  );
}
