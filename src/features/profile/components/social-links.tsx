'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { api, message } from '@/features/market/service/market-client';
import { SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from '../service/social-platforms';

const ICONS: Record<SocialPlatform, string> = { tiktok: 'video', instagram: 'camera', youtube: 'play' };
const PLACEHOLDERS: Record<SocialPlatform, string> = { tiktok: 'https://www.tiktok.com/@tuusuario', instagram: 'https://www.instagram.com/tuusuario', youtube: 'https://www.youtube.com/@tucanal' };

/** Enlaces del criador a sus redes. Los abre en otra pestaña; quien es dueño del perfil ve el botón para editarlos. */
export function SocialLinksRow({ links, owner, onEdit }: { links?: SocialLinks; owner: boolean; onEdit: () => void }) {
  const shown = SOCIAL_PLATFORMS.filter(platform => links?.[platform]);
  if (!shown.length && !owner) return null;
  return (
    <div className="social-links" aria-label="Redes del criador">
      {shown.map(platform => (
        <a key={platform} className={`social-pill sp-${platform}`} href={links![platform]} target="_blank" rel="noopener noreferrer nofollow"><Icon name={ICONS[platform]} size={15} />{SOCIAL_LABELS[platform]}</a>
      ))}
      {owner && <button type="button" className="social-edit" onClick={onEdit}><Icon name={shown.length ? 'edit' : 'plus'} size={14} />{shown.length ? 'Editar redes' : 'Agregar mis redes'}</button>}
    </div>
  );
}

/** Hoja para escribir o quitar los enlaces a TikTok, Instagram y YouTube del perfil. */
export function SocialLinksDialog({ links, onClose, onSaved }: { links?: SocialLinks; onClose: () => void; onSaved: (links: SocialLinks) => void }) {
  const dialogs = useDialogs();
  const [values, setValues] = useState<Record<SocialPlatform, string>>({ tiktok: links?.tiktok ?? '', instagram: links?.instagram ?? '', youtube: links?.youtube ?? '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onClose]);

  async function save() {
    setBusy(true); setError('');
    try {
      const result = await api<{ links: SocialLinks }>('/api/profile/social', { method: 'PUT', body: values });
      dialogs.notify('Redes guardadas.');
      onSaved(result.links); onClose();
    } catch (cause) { setError(message(cause, 'No se pudieron guardar tus redes.')); setBusy(false); }
  }

  return (
    <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-dialog mini-dialog" role="dialog" aria-modal="true" aria-labelledby="social-title" ref={box}>
        <div className="dialog-top"><div><h2 id="social-title">Mis redes</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        <p className="mini-dialog-text">Pega el enlace de tu <strong>perfil</strong> (no de un video). Se mostrará en tu perfil público. Déjalo vacío para quitarlo.</p>
        {SOCIAL_PLATFORMS.map(platform => (
          <label className="form-field" key={platform}><span>{SOCIAL_LABELS[platform]}</span>
            <input type="text" inputMode="url" autoComplete="off" maxLength={300} value={values[platform]} placeholder={PLACEHOLDERS[platform]} onChange={event => setValues(current => ({ ...current, [platform]: event.target.value }))} disabled={busy} />
          </label>
        ))}
        {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
        <div className="dialog-actions"><button className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} aria-busy={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </section>
    </div>
  );
}
