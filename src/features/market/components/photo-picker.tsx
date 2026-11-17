'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { fitSize } from '../service/photo-size';

const MAX_SIDE = 1600;

/** Reduce una imagen a JPEG de hasta 1600 px antes de enviarla; así las fotos de celular no pesan decenas de MB. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function PhotoPicker({ value, onChange, max = 6 }: { value: string[]; onChange: (photos: string[]) => void; max?: number }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setNote(''); setBusy(true);
    const next = [...value];
    let skipped = 0, over = false;
    for (const file of Array.from(files)) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { skipped++; continue; }
      if (next.length >= max) { over = true; break; }
      try { next.push(await shrink(file)); } catch { skipped++; }
    }
    onChange(next);
    const parts = [over ? `Máximo ${max} fotos.` : '', skipped ? `Se omitieron ${skipped} archivo${skipped === 1 ? '' : 's'} que no son imagen JPG, PNG o WEBP.` : ''].filter(Boolean);
    setNote(parts.join(' '));
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="photo-picker">
      <div className="photo-picker-grid">
        {value.map((src, index) => (
          <figure key={src.slice(-32) + index} className="photo-picker-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Foto ${index + 1} de ${value.length}`} />
            {index === 0 && <figcaption>Portada</figcaption>}
            <button type="button" className="photo-picker-remove" aria-label={`Quitar foto ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Icon name="close" size={14} /></button>
          </figure>
        ))}
        {value.length < max && (
          <button type="button" className="photo-picker-add" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="plus" size={20} /><span>{busy ? 'Preparando…' : 'Agregar fotos'}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => void add(e.target.files)} />
      <small className="field-hint">{value.length} de {max} fotos. La primera es la portada. Se reducen automáticamente.</small>
      {note && <small className="photo-picker-note" role="status">{note}</small>}
    </div>
  );
}
