'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/shared/components/icon';
import { useDialogs } from '@/shared/components/dialogs';
import { api, message } from '@/features/market/service/market-client';
import { COLOMBIA_PLACES, type Location } from '../service/location-data';

/** Hoja para escribir la ciudad (con sugerencias) y el departamento. Guardar con la ciudad vacía quita la ubicación. */
function LocationDialog({ current, onClose, onSaved }: { current?: Location; onClose: () => void; onSaved: (location?: Location) => void }) {
  const dialogs = useDialogs();
  const [city, setCity] = useState(current?.city ?? ''), [region, setRegion] = useState(current?.region ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  function pickCity(value: string) {
    setCity(value);
    const known = COLOMBIA_PLACES.find(place => place.city.toLocaleLowerCase('es-CO') === value.trim().toLocaleLowerCase('es-CO'));
    if (known?.region) setRegion(known.region);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await api<{ location: Location | null }>('/api/profile/location', { method: 'PUT', body: { city: city.trim(), region: region.trim() } });
      dialogs.notify(result.location ? `Ubicación guardada: ${result.location.city}.` : 'Ubicación quitada.');
      onSaved(result.location ?? undefined); onClose();
    } catch (cause) { setError(message(cause, 'No se pudo guardar tu ubicación.')); setBusy(false); }
  }

  return createPortal(
    <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-dialog mini-dialog" role="dialog" aria-modal="true" aria-labelledby="location-title" ref={box}>
        <div className="dialog-top"><div><h2 id="location-title">Mi ubicación</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        <p className="mini-dialog-text">Con tu ciudad, los reels y el mercado muestran primero lo que está cerca de ti: tu ciudad, luego tu departamento. Solo se muestra la ciudad, no tu dirección.</p>
        <label className="form-field"><span>Ciudad o municipio</span>
          <input list="location-places" autoComplete="off" maxLength={60} value={city} placeholder="Ej.: Medellín" onChange={event => pickCity(event.target.value)} disabled={busy} />
        </label>
        <datalist id="location-places">{COLOMBIA_PLACES.map(place => <option key={`${place.city}-${place.region}`} value={place.city}>{place.region}</option>)}</datalist>
        <label className="form-field"><span>Departamento (opcional)</span>
          <input autoComplete="off" maxLength={60} value={region} placeholder="Ej.: Antioquia" onChange={event => setRegion(event.target.value)} disabled={busy} />
        </label>
        {error && <p className="form-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
        <div className="dialog-actions"><button className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} aria-busy={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </section>
    </div>,
    document.body,
  );
}

/** Muestra la ubicación de quien mira («Cerca de: Medellín») y permite cambiarla; avisa con `onChanged` para recargar la lista. */
export function LocationChip({ onChanged, className = '' }: { onChanged?: (location?: Location) => void; className?: string }) {
  const [state, setState] = useState<{ loaded: boolean; location?: Location }>({ loaded: false }), [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ profile: { location?: Location | null } }>('/api/profile').then(result => { if (active) setState({ loaded: true, location: result.profile.location ?? undefined }); }).catch(() => { if (active) setState({ loaded: true }); });
    return () => { active = false; };
  }, []);
  const close = useCallback(() => setOpen(false), []);
  if (!state.loaded) return null;
  const { location } = state;
  return (
    <>
      <button type="button" className={`location-chip${location ? '' : ' is-empty'} ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="pin" size={14} />
        {location ? <><span>Cerca de <strong>{location.city}</strong></span><em>Cambiar</em></> : <span>Indica tu ciudad para ver primero lo cercano</span>}
      </button>
      {open && <LocationDialog current={location} onClose={close} onSaved={next => { setState({ loaded: true, location: next }); onChanged?.(next); }} />}
    </>
  );
}
