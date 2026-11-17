'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { api, message } from '@/features/market/service/market-client';
import { prepareAvatar, uploadBlob } from '../service/media-client';
import { PICKED_IMAGE_LIMIT_BYTES } from '../service/media-limits';
import { Avatar } from './avatar';

// Cambiar o quitar la foto de perfil: se recorta en cuadrado, se comprime en el navegador y se sube.
export function AvatarEditor({ name, url, size = 96, onChange }: { name: string; url?: string | null; size?: number; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = '';
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) { setError('Elige una foto JPG, PNG o WEBP.'); return; }
    if (file.size > PICKED_IMAGE_LIMIT_BYTES) { setError('La foto es demasiado grande (máximo 40 MB).'); return; }
    setBusy(true);
    try {
      const blob = await prepareAvatar(file);
      const uploaded = await uploadBlob(blob, { purpose: 'avatar' });
      const saved = await api<{ avatarUrl: string | null }>('/api/profile/avatar', { method: 'PUT', body: { mediaId: uploaded.id } });
      onChange(saved.avatarUrl);
      dialogs.notify('Foto de perfil actualizada.');
    } catch (e) { setError(message(e, 'No se pudo cambiar la foto.')); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!(await dialogs.confirm({ title: 'Quitar foto de perfil', message: 'Se mostrarán tus iniciales en lugar de la foto.', confirmLabel: 'Quitar', danger: true }))) return;
    setBusy(true); setError('');
    try { await api('/api/profile/avatar', { method: 'PUT', body: { mediaId: null } }); onChange(null); }
    catch (e) { setError(message(e, 'No se pudo quitar la foto.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="avatar-editor">
      <Avatar url={url} name={name} size={size} />
      <div className="avatar-editor-actions">
        <button type="button" className="btn-secondary" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}><Icon name="plus" size={15} />{busy ? 'Subiendo…' : url ? 'Cambiar foto' : 'Subir foto de perfil'}</button>
        {url && <button type="button" className="text-link" disabled={busy} onClick={() => void remove()}>Quitar foto</button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => void pick(e.target.files)} />
      </div>
      {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
    </div>
  );
}
