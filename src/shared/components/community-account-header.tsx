'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Avatar } from '@/features/profile/components/avatar';
import type { NotificationLink } from '@/server/storage/types';
import { useDialogs } from './dialogs';
import { Icon } from './icon';
import { notifySessionChange } from './primary-dock';

// Se cargan solo al abrir la hoja: así las pantallas de reels y perfiles no pagan por ellos.
const NotificationCenter = dynamic(() => import('@/features/notifications/components/notification-center').then(module => module.NotificationCenter), { ssr: false });
const MessagesPage = dynamic(() => import('@/features/market/components/messages-page').then(module => module.MessagesPage), { ssr: false });

type Account = { id: string; email: string; displayName?: string; avatarUrl?: string };
type Panel = { kind: 'notifications' } | { kind: 'messages'; thread?: string };

/** Compact creator header shared by the signed-in community pages. Mensajes y notificaciones se abren aquí mismo, sin salir de la pantalla. */
export function CommunityAccountHeader() {
  const [account, setAccount] = useState<Account | null>(null), [panel, setPanel] = useState<Panel | null>(null);
  const router = useRouter(), dialogs = useDialogs();

  useEffect(() => {
    let active = true;
    fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (active && response.ok) setAccount(body.user ?? null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const close = useCallback(() => setPanel(null), []);
  // Al tocar una notificación: los mensajes se abren en la misma hoja; el resto lleva a su pantalla.
  const open = useCallback((link: NotificationLink) => {
    if (link.view === 'mensajes') { setPanel({ kind: 'messages', thread: link.id }); return; }
    if (link.view === 'post' && link.id) { const [author, post] = link.id.split('#'); router.push(`/mercado/vendedor/${author}?post=${post}`); return; }
    router.push(`/mi-granja?view=${encodeURIComponent(link.view)}`);
  }, [router]);

  async function logout() {
    if (!(await dialogs.confirm({ title: 'Cerrar sesión', message: 'Saldrás de tu cuenta en este dispositivo.', confirmLabel: 'Cerrar sesión' }))) return;
    try { await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); }
    finally { notifySessionChange(); setAccount(null); router.replace('/'); router.refresh(); }
  }

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, close]);

  const name = account?.displayName || account?.email.split('@')[0] || 'Pico Criollo';
  return (
    <header className="community-account-header">
      <Link className="community-account-identity" href={account ? '/mi-perfil' : '/'} aria-label={account ? `Perfil de ${name}` : 'Pico Criollo'}>
        {account ? <Avatar url={account.avatarUrl} name={name} size={44} /> : <span className="community-account-mark"><Icon name="bird" size={22} /></span>}
        <span className="community-account-copy">
          {account ? <small>Criador <Icon name="sprout" size={13} /></small> : <small>Comunidad avícola</small>}
          <strong>{name}</strong>
        </span>
      </Link>
      {account && <div className="community-account-actions">
        <button type="button" aria-label="Mensajes" aria-haspopup="dialog" onClick={() => setPanel({ kind: 'messages' })}><Icon name="chat" size={19} /></button>
        <button type="button" aria-label="Notificaciones" aria-haspopup="dialog" onClick={() => setPanel({ kind: 'notifications' })}><Icon name="bell" size={19} /></button>
        <button type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void logout()}><Icon name="logout" size={19} /></button>
      </div>}
      {panel && createPortal(
        <div className="dialog-backdrop dialog-top-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
          <section className="record-dialog mini-dialog header-sheet" role="dialog" aria-modal="true" aria-label={panel.kind === 'messages' ? 'Mensajes' : 'Notificaciones'}>
            <div className="dialog-top"><div><h2>{panel.kind === 'messages' ? 'Mensajes' : 'Notificaciones'}</h2></div><button className="icon-button" onClick={close} aria-label="Cerrar"><Icon name="close" /></button></div>
            <div className="header-sheet-body">
              {panel.kind === 'messages'
                ? <MessagesPage key={panel.thread ?? 'all'} initialThread={panel.thread} />
                : <NotificationCenter onOpen={open} onChanged={() => undefined} />}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </header>
  );
}
