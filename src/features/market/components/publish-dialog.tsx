'use client';
import { useMemo, useState } from 'react';
import type { Bird, FarmData } from '@/models/farm';
import type { ItemType } from '@/server/storage/types';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { zonedLocalToIso } from '@/shared/time';
import { AUCTION_LIMITS, defaultMinIncrement } from '../service/auction-rules';
import { api, message, money } from '../service/market-client';
import { PhotoPicker } from './photo-picker';

type Kind = 'fixed' | 'auction' | 'interest';
const BLOCKED = ['Vendido', 'Fallecido', 'Transferido'];
const MAX_BIRDS = 50;
const TYPES: { id: ItemType; label: string; hint: string }[] = [
  { id: 'ave', label: 'Un ave', hint: 'Un individuo con su ficha.' },
  { id: 'lote_aves', label: 'Lote de aves', hint: 'Varias aves que se venden juntas.' },
  { id: 'lote_pollitos', label: 'Lote de pollitos', hint: 'Una cantidad de un lote de pollitos.' },
  { id: 'lote_huevos', label: 'Lote de huevos', hint: 'Una cantidad de un lote de huevos.' },
  { id: 'insumo', label: 'Insumo', hint: 'Cuido, maíz, equipos u otros productos de tu granja.' },
];

export function PublishDialog({ bird, initialType, data, onClose, onDone }: { bird?: Bird; initialType?: ItemType; data: FarmData; onClose: () => void; onDone: (text: string) => void }) {
  const [itemType, setItemType] = useState<ItemType>(bird ? 'ave' : initialType ?? 'ave');
  const [birdId, setBirdId] = useState(bird?.id ?? ''), [birdIds, setBirdIds] = useState<string[]>([]), [birdSearch, setBirdSearch] = useState('');
  const [lotId, setLotId] = useState(''), [quantity, setQuantity] = useState(''), [photos, setPhotos] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>('fixed'), [price, setPrice] = useState(''), [terms, setTerms] = useState('');
  const [reserve, setReserve] = useState(''), [increment, setIncrement] = useState(''), [opens, setOpens] = useState(''), [closes, setCloses] = useState(''), [sniping, setSniping] = useState(false);
  const [description, setDescription] = useState(''), [zone, setZone] = useState(''), [health, setHealth] = useState('');
  const [showPhoto, setShowPhoto] = useState(true);
  const [showReproduction, setShowReproduction] = useState(false), [showBreeder, setShowBreeder] = useState(false), [breeder, setBreeder] = useState('');
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const timeZone = useTimeZone();

  const sellable = useMemo(() => data.birds.filter(item => !BLOCKED.includes(item.status)), [data.birds]);
  const selected = data.birds.find(item => item.id === birdId);
  const lots: { id: string; code: string; available: number; breed?: string; name?: string; unit?: string; category?: string }[] = itemType === 'lote_pollitos' ? data.chickLots.filter(l => l.available > 0) : itemType === 'lote_huevos' ? data.fertileLots.filter(l => l.available > 0) : itemType === 'insumo' ? (data.customProducts ?? []).filter(p => p.available > 0) : [];
  const lot = lots.find(l => l.id === lotId);
  const qty = Number(quantity);
  const isLot = itemType !== 'ave';
  const withFicha = itemType === 'ave' || itemType === 'lote_aves';
  const ring = selected ? data.rings.find(item => item.birdId === selected.id && item.status === 'Asignado' && !item.endedAt)?.number : undefined;
  const mother = selected ? data.birds.find(item => item.id === selected.motherId) : undefined, father = selected ? data.birds.find(item => item.id === selected.fatherId) : undefined;
  const suggested = Number(price) > 0 ? defaultMinIncrement(Number(price)) : undefined;
  const filteredBirds = sellable.filter(item => !birdSearch || `${item.name} ${item.code ?? ''} ${item.breed}`.toLocaleLowerCase('es-CO').includes(birdSearch.toLocaleLowerCase('es-CO')));
  const photoFromFicha = itemType === 'ave' && showPhoto && Boolean(selected?.photo) && photos.length === 0;

  const sourceError = (): string => {
    if (itemType === 'ave') return selected ? '' : 'Selecciona el ave que vas a publicar.';
    if (itemType === 'lote_aves') return birdIds.length < 2 ? 'Selecciona al menos 2 aves para el lote.' : birdIds.length > MAX_BIRDS ? `Un lote admite máximo ${MAX_BIRDS} aves.` : '';
    if (!lot) return itemType === 'insumo' ? 'Selecciona el insumo.' : 'Selecciona el lote.';
    if (!Number.isInteger(qty) || qty < 1) return 'Indica una cantidad entera mayor que cero.';
    if (qty > lot.available) return `${itemType === 'insumo' ? 'El insumo' : 'El lote'} solo tiene ${lot.available} disponibles.`;
    return '';
  };
  const title = itemType === 'ave' ? selected?.name ?? 'Un ave' : itemType === 'lote_aves' ? `Lote de ${birdIds.length || '…'} aves` : itemType === 'insumo' ? (lot ? `${lot.name} · ${quantity || '…'} ${lot.unit}` : 'Nuevo insumo') : lot ? `Lote de ${quantity || '…'} ${itemType === 'lote_pollitos' ? 'pollitos' : 'huevos'}` : 'Nuevo lote';

  function changeType(next: ItemType) { setItemType(next); setError(''); setLotId(''); setQuantity(''); }
  function toggleBird(id: string) { setBirdIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }

  async function submit(publish: boolean) {
    setError('');
    const problem = sourceError();
    if (problem) { setError(problem); return; }
    if (kind !== 'interest' && !(Number(price) > 0)) { setError(kind === 'auction' ? 'Indica el precio inicial en pesos colombianos.' : 'Indica un precio mayor que cero en pesos colombianos.'); return; }
    if (publish && !accepted) { setError('Acepta las condiciones de publicación para continuar.'); return; }
    let auction: Record<string, unknown> | undefined;
    if (kind === 'auction') {
      const closesAt = zonedLocalToIso(closes, timeZone), opensAt = opens ? zonedLocalToIso(opens, timeZone) : undefined;
      if (!closesAt) { setError('Indica la fecha y hora de cierre.'); return; }
      if (opens && !opensAt) { setError('La fecha de apertura no es válida.'); return; }
      auction = { startingPrice: Number(price), closesAt, ...(opensAt ? { opensAt } : {}), ...(increment ? { minIncrement: Number(increment) } : {}), ...(reserve ? { reservePrice: Number(reserve) } : {}), antiSniping: sniping };
    }
    setBusy(true);
    try {
      await api('/api/market/listings', { method: 'POST', body: {
        itemType, ...(itemType === 'ave' ? { birdId } : itemType === 'lote_aves' ? { birdIds } : { lotId, quantity: qty }),
        kind, price: kind === 'fixed' ? Number(price) : undefined, terms, publish, auction, photos,
        consent: { description, deliveryZone: zone, healthNote: health, showPhoto: photoFromFicha || showPhoto, showGenealogy: true, showReproduction, showBreeder, breederAlias: breeder },
      } });
      onDone(publish ? `«${title}» ya está en el Mercado Avícola.` : `Borrador de «${title}» guardado.`);
      onClose();
    } catch (e) { setError(message(e, 'No se pudo publicar.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <div className="dialog-top">
          <div><span className="eyebrow">PUBLICAR EN EL MERCADO</span><h2 id="publish-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        {!bird && (
          <div className="publish-types" role="radiogroup" aria-label="Qué vas a publicar">
            {TYPES.map(type => (
              <button key={type.id} type="button" role="radio" aria-checked={itemType === type.id} className={itemType === type.id ? 'selected' : ''} onClick={() => changeType(type.id)}>
                <strong>{type.label}</strong><small>{type.hint}</small>
              </button>
            ))}
          </div>
        )}

        <div className="form-grid">
          {itemType === 'ave' && !bird && (
            <label className="form-field span-two"><span>Ave <i>*</i></span>
              <select value={birdId} onChange={e => setBirdId(e.target.value)}><option value="">Selecciona un ave</option>{sellable.map(item => <option key={item.id} value={item.id}>{item.name} · {item.code ?? 'sin código'} · {item.breed}</option>)}</select>
            </label>
          )}
          {itemType === 'lote_aves' && (
            <fieldset className="publish-birds span-two">
              <legend>Aves del lote <i>*</i> <small className="field-hint">{birdIds.length} seleccionadas (mínimo 2, máximo {MAX_BIRDS})</small></legend>
              <input aria-label="Buscar aves" placeholder="Buscar por nombre, código o raza…" value={birdSearch} onChange={e => setBirdSearch(e.target.value)} />
              <div className="publish-bird-list">
                {filteredBirds.length === 0 ? <p className="empty-inline">No hay aves disponibles.</p> : filteredBirds.map(item => (
                  <label key={item.id}><input type="checkbox" checked={birdIds.includes(item.id)} onChange={() => toggleBird(item.id)} /> {item.name} <small>{item.code ?? 'sin código'} · {item.breed} · {item.sex}</small></label>
                ))}
              </div>
            </fieldset>
          )}
          {(itemType === 'lote_pollitos' || itemType === 'lote_huevos' || itemType === 'insumo') && (
            <>
              <label className="form-field"><span>{itemType === 'insumo' ? 'Insumo' : 'Lote de origen'} <i>*</i></span>
                <select value={lotId} onChange={e => { setLotId(e.target.value); setQuantity(''); }}>
                  <option value="">{lots.length ? (itemType === 'insumo' ? 'Selecciona un insumo' : 'Selecciona un lote') : (itemType === 'insumo' ? 'No tienes insumos con existencias' : 'No tienes lotes con existencias')}</option>
                  {lots.map(item => <option key={item.id} value={item.id}>{itemType === 'insumo' ? `${item.name} · ${item.available} ${item.unit} disponibles · ${item.category || 'sin categoría'}` : `${item.code} · ${item.available} disponibles · ${item.breed || 'sin raza'}`}</option>)}
                </select>
              </label>
              <label className="form-field"><span>Cantidad a vender <i>*</i>{lot ? <small className="field-hint"> (máx. {lot.available})</small> : null}</span>
                <input type="number" min={1} max={lot?.available} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ej.: 12" />
              </label>
            </>
          )}
        </div>

        <div className="market-preview panel">
          <strong>Esto será visible públicamente</strong>
          <ul>
            {itemType === 'ave' && <li>Nombre, código{ring ? ` y anillo ${ring}` : ''}, raza ({selected?.breed || '—'}), sexo y edad.</li>}
            {itemType === 'lote_aves' && <li>Nombre, código, raza, sexo y edad de cada ave del lote. No se publican anillos.</li>}
            {itemType === 'insumo' && <li>Nombre, categoría, código y cantidad con su unidad.</li>}
            {isLot && itemType !== 'lote_aves' && itemType !== 'insumo' && <li>Código del lote, cantidad, raza{itemType === 'lote_huevos' ? ' y fertilidad tal como la registraste' : ' y edad'}.</li>}
            {photos.length > 0 && <li>{photos.length} foto{photos.length === 1 ? '' : 's'} que subes aquí.</li>}
            {photoFromFicha && <li>Tu fotografía actual de la ficha.</li>}
            {itemType === 'ave' && (mother || father) && <li>Linaje: {[mother && `madre ${mother.name}`, father && `padre ${father.name}`].filter(Boolean).join(' · ')}.</li>}
            {withFicha && showReproduction && <li>Número de crías registradas en Pico Criollo.</li>}
            <li>Tu alias público{showBreeder && breeder ? ` y el criadero «${breeder}»` : ''}. No tu correo.</li>
          </ul>
          <small>No se publica: observaciones privadas, eventos sanitarios, ventas, clientes, dirección ni teléfono.</small>
        </div>

        <div className="form-grid">
          <div className="form-field span-two"><span>Fotos {isLot && <small className="field-hint">Recomendado: agrega fotos del lote.</small>}</span><PhotoPicker value={photos} onChange={setPhotos} /></div>
          <label className="form-field"><span>Tipo de venta</span>
            <select value={kind} onChange={e => setKind(e.target.value as Kind)}><option value="fixed">Precio fijo</option><option value="auction">Subasta</option><option value="interest">Publicación de interés (sin precio)</option></select>
          </label>
          <label className="form-field span-two"><span>Descripción de la publicación <small className="field-hint">({description.length}/1200)</small></span><textarea rows={4} maxLength={1200} value={description} onChange={e => setDescription(e.target.value)} placeholder="Cuéntale al comprador cómo es: temperamento, porte, plumaje, producción, alimentación…" /></label>
          {kind !== 'interest' && <label className="form-field"><span>{kind === 'auction' ? 'Precio inicial (COP)' : isLot ? 'Precio del lote completo (COP)' : 'Precio (COP)'} <i>*</i></span><input type="number" min={1} step={1000} value={price} onChange={e => setPrice(e.target.value)} placeholder="Ej.: 85000" /></label>}
          {kind === 'auction' && <>
            <label className="form-field"><span>Cierre <i>*</i> <small className="field-hint">({timeZone})</small></span><input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} /></label>
            <label className="form-field"><span>Apertura (opcional) <small className="field-hint">si queda vacía, abre al publicar</small></span><input type="datetime-local" value={opens} onChange={e => setOpens(e.target.value)} /></label>
            <label className="form-field"><span>Incremento mínimo (COP)</span><input type="number" min={100} step={100} value={increment} onChange={e => setIncrement(e.target.value)} placeholder={suggested ? `Por defecto ${money(suggested)}` : 'Por defecto: el mayor entre 1.000 y 5 %'} /></label>
            <label className="form-field"><span>Precio de reserva (opcional, oculto)</span><input type="number" min={0} step={1000} value={reserve} onChange={e => setReserve(e.target.value)} placeholder="Si no se alcanza, no hay venta" /></label>
            <label className="market-accept span-two"><input type="checkbox" checked={sniping} onChange={e => setSniping(e.target.checked)} /> Extender el cierre {AUCTION_LIMITS.antiSniping.extendSeconds / 60} min si llega una oferta en los últimos {AUCTION_LIMITS.antiSniping.windowSeconds / 60} min.</label>
            <p className="form-hint span-two"><Icon name="alert" size={15} /> Reglas: la subasta dura de 1 hora a 30 días. Gana la oferta más alta (si hay empate, la más temprana) siempre que alcance la reserva. Las ofertas son vinculantes pero no son pagos. Con ofertas ya no podrás editarla; solo cancelarla con motivo y más de 24 h antes del cierre.</p>
          </>}
          <label className="form-field"><span>Zona aproximada de entrega</span><input maxLength={120} value={zone} onChange={e => setZone(e.target.value)} placeholder="Municipio y departamento (no tu dirección)" /></label>
          <label className="form-field"><span>Estado de salud declarado</span><input maxLength={400} value={health} onChange={e => setHealth(e.target.value)} placeholder="Lo que tú declaras; no es verificado" /></label>
          <label className="form-field span-two"><span>Condiciones de venta</span><textarea rows={2} maxLength={1000} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Forma de pago, entrega, garantías…" /></label>
        </div>
        <div className="market-consents">
          {itemType === 'ave' && <label><input type="checkbox" checked={showPhoto} disabled={!selected?.photo || photos.length > 0} onChange={e => setShowPhoto(e.target.checked)} /> Mostrar la fotografía de la ficha{photos.length > 0 ? ' (ya subiste fotos)' : ''}</label>}
          {itemType === 'ave' && <p className="form-hint"><Icon name="info" size={14} /> El linaje (padres, abuelos y bisabuelos que tengas registrados) siempre se muestra a los compradores.</p>}
          {withFicha && <label><input type="checkbox" checked={showReproduction} onChange={e => setShowReproduction(e.target.checked)} /> Mostrar número de crías</label>}
          <label><input type="checkbox" checked={showBreeder} onChange={e => setShowBreeder(e.target.checked)} /> Mostrar nombre de criadero</label>
          {showBreeder && <input aria-label="Nombre del criadero" maxLength={60} value={breeder} onChange={e => setBreeder(e.target.value)} placeholder="Nombre del criadero" />}
        </div>
        <label className="market-accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Declaro que soy el propietario de lo que publico, que los datos son verídicos y acepto que Pico Criollo no verifica identidad, raza, genealogía, fertilidad ni salud.</label>
        {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose} disabled={busy} aria-busy={busy}>Cancelar</button>
          <button className="btn-secondary" onClick={() => void submit(false)} disabled={busy}>Guardar borrador</button>
          <button className="btn-primary" onClick={() => void submit(true)} disabled={busy}>{busy ? 'Publicando…' : 'Confirmar publicación'}</button>
        </div>
      </section>
    </div>
  );
}
