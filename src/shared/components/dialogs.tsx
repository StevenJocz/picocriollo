'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icon';

// Reemplazo de window.prompt / confirm / alert. Los diálogos nativos no existen en algunos navegadores integrados
// (por ejemplo `prompt() is not supported`) y rompían acciones como «Declarar pago realizado».

export interface AskOptions {
  title: string; message?: string; label?: string; placeholder?: string; defaultValue?: string; multiline?: boolean;
  minLength?: number; maxLength?: number; confirmLabel?: string; /** Permite enviar vacío. */ optional?: boolean; /** Atajos que rellenan el campo. */ suggestions?: string[];
  /** Validación extra: devuelve un texto de error o '' si es válido. */ validate?: (value: string) => string;
}
export interface ConfirmOptions { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; }
export interface RateOptions { title: string; message?: string; }
export interface RateResult { stars: number; comment: string; }
export interface Dialogs {
  ask: (options: AskOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  rate: (options: RateOptions) => Promise<RateResult | null>;
  /** Aviso breve que desaparece solo (reemplaza a window.alert). */
  notify: (text: string, tone?: 'ok' | 'error') => void;
}

type Pending =
  | { kind: 'ask'; options: AskOptions; resolve: (value: string | null) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'rate'; options: RateOptions; resolve: (value: RateResult | null) => void };

const Ctx = createContext<Dialogs | null>(null);

/** Respaldo sin proveedor (pruebas, páginas sin el contexto): usa los diálogos nativos solo si existen. */
const nativeFallback: Dialogs = {
  ask: async options => { try { return window.prompt(options.message ?? options.title, options.defaultValue ?? ''); } catch { return null; } },
  confirm: async options => { try { return window.confirm(options.message ?? options.title); } catch { return false; } },
  rate: async () => null,
  notify: text => { try { window.alert(text); } catch { /* sin diálogos nativos */ } },
};

export const useDialogs = (): Dialogs => useContext(Ctx) ?? nativeFallback;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]), [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error'; id: number } | null>(null);
  const toastTimer = useRef(0);
  const current = queue[0];

  const push = useCallback(<T,>(build: (resolve: (value: T) => void) => Pending): Promise<T> => new Promise<T>(resolve => {
    setQueue(items => [...items, build(resolve)]);
  }), []);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  // La respuesta se entrega de inmediato; el diálogo se retira tras una breve animación de salida (180 ms).
  const finish = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true; setClosing(true);
    window.setTimeout(() => { setQueue(items => items.slice(1)); closingRef.current = false; setClosing(false); }, 180);
  }, []);

  const api = useMemo<Dialogs>(() => ({
    ask: options => push<string | null>(resolve => ({ kind: 'ask', options, resolve })),
    confirm: options => push<boolean>(resolve => ({ kind: 'confirm', options, resolve })),
    rate: options => push<RateResult | null>(resolve => ({ kind: 'rate', options, resolve })),
    notify: (text, tone = 'ok') => {
      window.clearTimeout(toastTimer.current);
      setToast({ text, tone, id: Date.now() });
      toastTimer.current = window.setTimeout(() => setToast(null), 4500);
    },
  }), [push]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {current?.kind === 'ask' && <AskDialog key={queue.length + current.options.title} closing={closing} options={current.options} onDone={value => { current.resolve(value); finish(); }} />}
      {current?.kind === 'confirm' && <ConfirmDialog closing={closing} options={current.options} onDone={value => { current.resolve(value); finish(); }} />}
      {current?.kind === 'rate' && <RateDialog closing={closing} options={current.options} onDone={value => { current.resolve(value); finish(); }} />}
      {toast && <div className={`app-toast ${toast.tone === 'error' ? 'app-toast-error' : ''}`} role="status" aria-live="polite"><Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={16} /><span>{toast.text}</span><button aria-label="Cerrar aviso" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
    </Ctx.Provider>
  );
}

/** Marco común: foco inicial, Esc cancela, clic fuera cancela y Tab no sale del diálogo. */
function Frame({ title, onCancel, children, labelId, closing }: { title: string; onCancel: () => void; children: ReactNode; labelId: string; closing?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // El campo (o el botón principal) recibe el foco, no el botón de cerrar que aparece primero en el DOM.
    const first = box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current?.querySelector<HTMLElement>('textarea, input') ?? box.current?.querySelector<HTMLElement>('.dialog-actions .btn-primary, .dialog-actions button');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCancel(); return; }
      if (event.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
      if (!items.length) return;
      const firstItem = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstItem.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onCancel]);
  return (
    <div className="dialog-backdrop dialog-top-layer" role="presentation" data-closing={closing || undefined} onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="record-dialog mini-dialog" role="dialog" aria-modal="true" aria-labelledby={labelId} ref={box}>
        <div className="dialog-top"><div><h2 id={labelId}>{title}</h2></div><button className="icon-button" onClick={onCancel} aria-label="Cerrar"><Icon name="close" /></button></div>
        {children}
      </section>
    </div>
  );
}

function AskDialog({ options, onDone, closing }: { options: AskOptions; onDone: (value: string | null) => void; closing?: boolean }) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const trimmed = value.trim(), min = options.minLength ?? (options.optional ? 0 : 1);
  const problem = trimmed.length === 0 && options.optional ? '' : trimmed.length < min ? `Escribe al menos ${min} caracteres (llevas ${trimmed.length}).` : options.validate?.(trimmed) ?? '';
  const submit = () => { if (!problem) onDone(trimmed); };
  const cancel = useCallback(() => onDone(null), [onDone]);
  const Field = options.multiline ? 'textarea' : 'input';
  return (
    <Frame closing={closing} title={options.title} onCancel={cancel} labelId="ask-title">
      {options.message && <p className="mini-dialog-text">{options.message}</p>}
      <label className="form-field">
        {options.label && <span>{options.label}</span>}
        <Field
          data-autofocus value={value} maxLength={options.maxLength} placeholder={options.placeholder} aria-invalid={Boolean(problem && trimmed.length > 0)}
          {...(options.multiline ? { rows: 3 } : {})}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as KeyboardEvent).isComposing && (!options.multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } }}
        />
      </label>
      {options.suggestions && <div className="mini-chips">{options.suggestions.map(item => <button key={item} type="button" className={value === item ? 'selected' : ''} onClick={() => setValue(item)}>{item}</button>)}</div>}
      <small className={`mini-dialog-hint ${problem && trimmed.length > 0 ? 'mini-dialog-error' : ''}`} role={problem && trimmed.length > 0 ? 'alert' : undefined}>
        {problem && trimmed.length > 0 ? problem : options.maxLength ? `${trimmed.length} de ${options.maxLength} caracteres` : ''}
      </small>
      <div className="dialog-actions"><button className="btn-secondary" onClick={cancel}>Cancelar</button><button className="btn-primary" disabled={Boolean(problem)} onClick={submit}>{options.confirmLabel ?? 'Aceptar'}</button></div>
    </Frame>
  );
}

function ConfirmDialog({ options, onDone, closing }: { options: ConfirmOptions; onDone: (value: boolean) => void; closing?: boolean }) {
  const cancel = useCallback(() => onDone(false), [onDone]);
  return (
    <Frame closing={closing} title={options.title} onCancel={cancel} labelId="confirm-title">
      {options.message && <p className="mini-dialog-text">{options.message}</p>}
      <div className="dialog-actions">
        <button className="btn-secondary" onClick={cancel}>{options.cancelLabel ?? 'Cancelar'}</button>
        <button data-autofocus className={options.danger ? 'btn-danger' : 'btn-primary'} onClick={() => onDone(true)}>{options.confirmLabel ?? 'Confirmar'}</button>
      </div>
    </Frame>
  );
}

function RateDialog({ options, onDone, closing }: { options: RateOptions; onDone: (value: RateResult | null) => void; closing?: boolean }) {
  const [stars, setStars] = useState(0), [comment, setComment] = useState('');
  const cancel = useCallback(() => onDone(null), [onDone]);
  const clean = comment.trim();
  return (
    <Frame closing={closing} title={options.title} onCancel={cancel} labelId="rate-title">
      {options.message && <p className="mini-dialog-text">{options.message}</p>}
      <div className="rate-stars" role="radiogroup" aria-label="Valoración de 1 a 5 estrellas">
        {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}><Icon name="star" size={26}/></button>)}
      </div>
      <label className="form-field"><span>Comentario (opcional, sin teléfonos ni correos)</span>
        <textarea rows={3} maxLength={500} value={comment} onChange={event => setComment(event.target.value)} />
      </label>
      <small className="mini-dialog-hint">{clean.length} de 500 caracteres</small>
      <div className="dialog-actions"><button className="btn-secondary" onClick={cancel}>Cancelar</button><button className="btn-primary" disabled={stars === 0} onClick={() => onDone({ stars, comment: clean })}>Enviar valoración</button></div>
    </Frame>
  );
}
