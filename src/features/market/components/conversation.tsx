'use client';
import { useDialogs } from '@/shared/components/dialogs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { isLive } from '@/shared/live-state';
import { api, message } from '../service/market-client';
import { UserLink } from './user-link';

interface ThreadData { id: string; listingName: string; operationId?: string; counterpart?: { id: string; alias: string; avatarUrl?: string }; messages: { id: string; mine: boolean; authorId?: string; author: string; body: string; createdAt: string }[]; }

// Conversación de una publicación. El comprador la abre con listingId; luego se usa threadId.
export function Conversation({ listingId, threadId, onThread, onLoaded, pollMs = 20_000 }: { listingId?: string; threadId?: string; onThread?: (id: string) => void; onLoaded?: (thread: { listingName: string; counterpart?: { id: string; alias: string; avatarUrl?: string } }) => void; pollMs?: number }) {
  const [thread, setThread] = useState<ThreadData | null>(null), [current, setCurrent] = useState(threadId), [text, setText] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const zone = useTimeZone();
  const dialogs = useDialogs();
  const end = useRef<HTMLDivElement>(null);
  // El callback cambia en cada render del padre: se guarda en una ref para no reiniciar la carga ni el sondeo.
  const loadedRef = useRef(onLoaded);
  useEffect(() => { loadedRef.current = onLoaded; });

  const load = useCallback(async (id: string | undefined) => {
    if (!id) return;
    try { const data = await api<ThreadData>(`/api/market/threads/${id}`); setThread(data); setError(''); loadedRef.current?.({ listingName: data.listingName, counterpart: data.counterpart }); }
    catch (e) { setError(message(e, 'No se pudo cargar la conversación.')); }
  }, []);
  // Con el canal en vivo conectado basta un sondeo lento de respaldo; el aviso `pico-live` recarga al instante.
  useEffect(() => {
    let stopped = false, timer = 0;
    const tick = async () => { await load(current); if (!stopped) timer = window.setTimeout(() => void tick(), isLive() ? pollMs * 6 : pollMs); };
    timer = window.setTimeout(() => void tick(), 0);
    const onLive = () => void load(current);
    window.addEventListener('pico-live', onLive);
    return () => { stopped = true; window.clearTimeout(timer); window.removeEventListener('pico-live', onLive); };
  }, [current, load, pollMs]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [thread?.messages.length]);

  async function reportMessage(id: string) {
    const reason = await dialogs.ask({ title: 'Denunciar mensaje', message: 'Describe por qué es abusivo este mensaje.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    try { await api('/api/market/reports', { method: 'POST', body: { targetType: 'message', targetId: id, reason } }); dialogs.notify('Denuncia enviada. Un moderador la revisará.'); }
    catch (e) { setError(message(e, 'No se pudo enviar la denuncia.')); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const sent = await api<{ threadId: string }>('/api/market/messages', { method: 'POST', body: current ? { threadId: current, body: text } : { listingId, body: text } });
      setText('');
      if (!current) { setCurrent(sent.threadId); onThread?.(sent.threadId); }
      await load(sent.threadId);
    } catch (e) { setError(message(e, 'No se pudo enviar el mensaje.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="conversation">
      <div className="conversation-log" aria-live="polite">
        {thread?.messages.length ? thread.messages.map(msg => (
          <div key={msg.id} className={`bubble ${msg.mine ? 'bubble-mine' : ''}`}><small>{msg.mine ? 'Tú' : <UserLink id={msg.authorId} name={msg.author} />} · {formatInZone(msg.createdAt, zone)}{!msg.mine && <button className="link-button" onClick={() => void reportMessage(msg.id)}>Denunciar</button>}</small><p>{msg.body}</p></div>
        )) : <p className="conversation-empty">{current ? 'Cargando…' : 'Escribe el primer mensaje. No compartas teléfono ni correo hasta que la operación esté aceptada.'}</p>}
        <div ref={end} />
      </div>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      <form className="conversation-form" onSubmit={e => void send(e)}>
        <textarea
          rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="Escribe tu mensaje… (Enter envía, Shift+Enter salto de línea)" aria-label="Mensaje"
          onKeyDown={e => {
            // Enter envía; Shift+Enter inserta un salto de línea. No se envía mientras se compone con un teclado IME (tildes, CJK).
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!busy && text.trim()) e.currentTarget.form?.requestSubmit();
          }}
        />
        <button className="btn-primary" disabled={busy || !text.trim()}>{busy ? 'Enviando…' : 'Enviar'}</button>
      </form>
    </div>
  );
}
