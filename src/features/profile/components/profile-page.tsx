'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Category, ChannelId, PreferencesRecord } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { AvatarEditor } from './avatar-editor';
import { resetTimeZoneCache } from '@/shared/hooks/use-time-zone';
import { api, message } from '@/features/market/service/market-client';
import { CATEGORIES, CATEGORY_LABELS, CHANNEL_LABELS } from '@/features/notifications/service/constants';
import type { ChannelStatus } from '@/features/notifications/service/channels';

interface Profile { id: string; avatarUrl: string | null; email: string; displayName: string; timeZone: string; role: string; contactPhone: string; }

const urlBase64ToUint8Array = (value: string) => {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};

export function ProfilePage({ onNotice }: { onNotice: (text: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null), [prefs, setPrefs] = useState<PreferencesRecord | null>(null), [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false), [browserBusy, setBrowserBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, q, c] = await Promise.all([api<{ profile: Profile }>('/api/profile'), api<{ preferences: PreferencesRecord }>('/api/notifications/preferences'), api<{ channels: ChannelStatus[] }>('/api/notifications/channels')]);
      setProfile(p.profile); setName(p.profile.displayName); setPhone(p.profile.contactPhone ?? ''); setPrefs(q.preferences); setChannels(c.channels); setError('');
    } catch (e) { setError(message(e, 'No se pudo cargar tu perfil.')); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function savePrefs(patch: Record<string, unknown>) {
    try { const result = await api<{ preferences: PreferencesRecord }>('/api/notifications/preferences', { method: 'PUT', body: patch }); setPrefs(result.preferences); setError(''); onNotice('Preferencias guardadas.'); }
    catch (e) { setError(message(e, 'No se pudieron guardar las preferencias.')); }
  }
  async function saveProfile() {
    setSaving(true);
    try {
      await api('/api/profile', { method: 'PUT', body: { displayName: name, timeZone: prefs?.timeZone, contactPhone: phone } });
      resetTimeZoneCache(); onNotice('Perfil actualizado.'); await load();
    } catch (e) { setError(message(e, 'No se pudo guardar el perfil.')); }
    finally { setSaving(false); }
  }

  // Los avisos del navegador se piden solo desde este botón, después de explicar para qué sirven.
  async function enableBrowser(status: ChannelStatus) {
    setBrowserBusy(true); setError('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no admite avisos push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No diste permiso a los avisos del navegador. Puedes cambiarlo en la configuración del sitio.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.vapidPublicKey ?? '') });
      await api('/api/notifications/push-subscription', { method: 'POST', body: { action: 'subscribe', subscription: subscription.toJSON() } });
      await savePrefs({ channels: { browser: true } });
    } catch (e) { setError(message(e, 'No se pudieron activar los avisos del navegador.')); }
    finally { setBrowserBusy(false); }
  }
  async function disableBrowser() {
    setBrowserBusy(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await api('/api/notifications/push-subscription', { method: 'POST', body: { action: 'unsubscribe', endpoint: subscription.endpoint } }); await subscription.unsubscribe(); }
      await savePrefs({ channels: { browser: false } });
    } catch (e) { setError(message(e, 'No se pudieron desactivar los avisos del navegador.')); }
    finally { setBrowserBusy(false); }
  }
  function toggleChannelCategory(channel: ChannelId, category: Category, on: boolean) {
    if (!prefs) return;
    const current = prefs.channelCategories[channel] ?? CATEGORIES;
    void savePrefs({ channelCategories: { [channel]: on ? [...new Set([...current, category])] : current.filter(item => item !== category) } });
  }

  if (!profile || !prefs) return error ? <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div> : <div className="loading-state"><span className="spinner" />Cargando perfil…</div>;
  return (
    <div className="module-view profile-view">
      <div className="module-title-row"><div><div className="breadcrumb"><span>Cuenta</span><Icon name="arrow" size={13} /><strong>Perfil y preferencias</strong></div><h1>Perfil y preferencias</h1><p>Cómo te ven otros criadores y qué avisos recibes.</p></div></div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      <article className="panel profile-card">
        <span className="eyebrow">IDENTIDAD PÚBLICA</span>
        <h2>Tu foto y tu nombre de usuario</h2>
        <div className="profile-photo-row">
          <AvatarEditor name={name || profile.email} url={profile.avatarUrl} size={88} onChange={url => setProfile(current => (current ? { ...current, avatarUrl: url } : current))} />
          <a className="btn-secondary" href={`/mercado/vendedor/${profile.id}`} target="_blank" rel="noopener noreferrer"><Icon name="user" size={15} />Ver mi perfil público y mis publicaciones</a>
        </div>
        <p>Compradores y vendedores ven este alias, nunca tu correo ({profile.email}).</p>
        <label className="form-field"><span>Nombre de usuario (público)</span><input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Ej.: Finca La Esperanza" /></label>
        <label className="form-field"><span>Teléfono de contacto (privado)</span><input value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} placeholder="Solo se revela si tú y la otra parte lo autorizan en una operación" /></label>
        <label className="form-field"><span>Zona horaria</span><input value={prefs.timeZone} onChange={e => setPrefs({ ...prefs, timeZone: e.target.value })} /></label>
        <button className="btn-primary" disabled={saving} aria-busy={saving} onClick={() => void saveProfile().then(() => savePrefs({ timeZone: prefs.timeZone }))}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
      </article>
      <article className="panel profile-card">
        <span className="eyebrow">CATEGORÍAS</span>
        <h2>Qué avisos quieres recibir</h2>
        <p>Las alertas críticas de seguridad e integridad comercial (operaciones canceladas o en disputa, transferencias, subastas ganadas) siempre se entregan.</p>
        <div className="pref-grid">{CATEGORIES.map((c: Category) => <label key={c} className="pref-toggle"><input type="checkbox" checked={prefs.categories[c]} onChange={e => void savePrefs({ categories: { [c]: e.target.checked } })} />{CATEGORY_LABELS[c]}</label>)}</div>
        <div className="pref-grid">
          <label className="pref-toggle"><input type="checkbox" checked={prefs.commercial.interests} onChange={e => void savePrefs({ commercial: { interests: e.target.checked } })} />Avisos de interesados</label>
          <label className="pref-toggle"><input type="checkbox" checked={prefs.commercial.offers} onChange={e => void savePrefs({ commercial: { offers: e.target.checked } })} />Avisos de ofertas</label>
        </div>
      </article>
      <article className="panel profile-card">
        <span className="eyebrow">CANALES</span>
        <h2>Dónde recibirlos</h2>
        <p>La bandeja interna siempre está activa. Los demás canales solo funcionan cuando el servidor tiene credenciales reales; si no, aparecen como «No configurado».</p>
        <ul className="channel-list">{channels.map(ch => {
          const on = prefs.channels[ch.id as ChannelId];
          return (
            <li key={ch.id}>
              <label className="pref-toggle"><input type="checkbox" checked={on} disabled={ch.id === 'inApp' || !ch.configured || ch.id === 'browser' || browserBusy} onChange={e => void savePrefs({ channels: { [ch.id]: e.target.checked } })} />{CHANNEL_LABELS[ch.id]}</label>
              <small className={ch.configured ? '' : 'channel-off'}>{ch.detail}</small>
              {ch.id === 'browser' && ch.configured && (
                <div className="channel-extra">
                  <p>Te avisaremos de eclosiones, tareas y ofertas aunque no tengas la app abierta. El navegador te pedirá permiso solo cuando pulses el botón.</p>
                  {on ? <button className="btn-secondary" disabled={browserBusy} onClick={() => void disableBrowser()}>Desactivar avisos del navegador</button> : <button className="btn-primary" disabled={browserBusy} onClick={() => void enableBrowser(ch)}>{browserBusy ? 'Activando…' : 'Activar avisos del navegador'}</button>}
                </div>
              )}
              {ch.id !== 'inApp' && ch.configured && on && (
                <div className="pref-grid channel-categories">{CATEGORIES.map((c: Category) => <label key={c} className="pref-toggle"><input type="checkbox" checked={(prefs.channelCategories[ch.id as ChannelId] ?? CATEGORIES).includes(c)} onChange={e => toggleChannelCategory(ch.id as ChannelId, c, e.target.checked)} />{CATEGORY_LABELS[c]}</label>)}</div>
              )}
            </li>
          );
        })}</ul>
      </article>
      <article className="panel profile-card">
        <span className="eyebrow">HORARIOS Y ANTICIPACIÓN</span>
        <h2>Silencio y recordatorios</h2>
        <label className="pref-toggle"><input type="checkbox" checked={prefs.quietHours.enabled} onChange={e => void savePrefs({ quietHours: { ...prefs.quietHours, enabled: e.target.checked } })} />Horario de silencio para avisos no urgentes (aplaza los canales externos; la bandeja interna los recibe igual)</label>
        <div className="form-grid">
          <label className="form-field"><span>Desde</span><input type="time" value={prefs.quietHours.start} onChange={e => void savePrefs({ quietHours: { ...prefs.quietHours, start: e.target.value } })} /></label>
          <label className="form-field"><span>Hasta</span><input type="time" value={prefs.quietHours.end} onChange={e => void savePrefs({ quietHours: { ...prefs.quietHours, end: e.target.value } })} /></label>
          <label className="form-field"><span>Avisar eclosión con (días)</span><input type="number" min={0} max={14} value={prefs.incubationLeadDays} onChange={e => void savePrefs({ incubationLeadDays: Number(e.target.value) })} /></label>
          <label className="form-field"><span>Margen tras la fecha estimada (días)</span><input type="number" min={0} max={7} value={prefs.incubationMarginDays} onChange={e => void savePrefs({ incubationMarginDays: Number(e.target.value) })} /></label>
          <label className="form-field"><span>Incubación sin actualizar tras (días)</span><input type="number" min={1} max={30} value={prefs.incubationStaleDays} onChange={e => void savePrefs({ incubationStaleDays: Number(e.target.value) })} /></label>
          <label className="form-field"><span>Avisar tareas con (días)</span><input type="number" min={0} max={30} value={prefs.taskLeadDays} onChange={e => void savePrefs({ taskLeadDays: Number(e.target.value) })} /></label>
        </div>
      </article>
    </div>
  );
}
