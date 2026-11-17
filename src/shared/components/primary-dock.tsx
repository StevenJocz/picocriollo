'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localDemoAuth } from '@/features/auth/service/local-demo-auth';
import { Icon } from './icon';

// Navegación principal de la app. Se muestra en TODAS las ventanas privadas (con sesión iniciada): inicio, granja, mercado,
// perfil, facturas y transferencias. A quien visita sin sesión no se le muestra: esas pantallas llevan su propio acceso.
export const SESSION_EVENT = 'pico-criollo:session';
/** Avisa al dock de que la sesión cambió (inicio o cierre de sesión sin cambiar de ruta). */
export const notifySessionChange = () => window.dispatchEvent(new Event(SESSION_EVENT));

const ITEMS = [
  { id: 'inicio', label: 'Inicio', icon: 'house', href: '/' },
  { id: 'granja', label: 'Mi granja', icon: 'bird', href: '/mi-granja' },
  { id: 'mercado', label: 'Mercado', icon: 'store', href: '/mercado' },
  { id: 'perfil', label: 'Mi perfil', icon: 'user', href: '/mi-perfil' },
] as const;

// Accesos del menú «Más» fuera de la granja: cada uno abre la sección correspondiente de «Mi granja».
const MORE = [
  { label: 'Notificaciones', icon: 'bell', href: '/mi-granja?view=notificaciones' },
  { label: 'Mis publicaciones', icon: 'tag', href: '/mi-granja?view=publicaciones' },
  { label: 'Mis compras', icon: 'swap', href: '/mi-granja?view=compras-mercado' },
  { label: 'Mis facturas', icon: 'receipt', href: '/mi-granja?view=facturas' },
  { label: 'Preferencias', icon: 'settings', href: '/mi-granja?view=perfil' },
] as const;

/** undefined = comprobando; null = sin sesión; texto = id del usuario. */
function useSessionUserId(pathname: string): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const localDemo = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOCAL_DEMO === 'true';
    const check = () => {
      if (localDemo) { if (active) setUserId(localDemoAuth.currentUser()?.id ?? null); return; }
      fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
        .then(response => response.json())
        .then(body => { if (active) setUserId(body?.user?.id ?? null); })
        .catch(() => { if (active) setUserId(null); });
    };
    check();
    window.addEventListener(SESSION_EVENT, check);
    window.addEventListener('focus', check);
    return () => { active = false; window.removeEventListener(SESSION_EVENT, check); window.removeEventListener('focus', check); };
  }, [pathname]);
  return userId;
}

export function PrimaryDock() {
  const pathname = usePathname();
  const userId = useSessionUserId(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const inFarm = pathname === '/mi-granja' || pathname.startsWith('/mi-granja/');
  const visible = Boolean(userId);

  // Fuera de «Mi granja» (que ya reserva su propio espacio) las páginas dejan sitio libre para la barra.
  useEffect(() => {
    document.body.dataset.dock = visible && !inFarm ? 'true' : 'false';
    return () => { delete document.body.dataset.dock; };
  }, [visible, inFarm]);
  useEffect(() => { const timer = window.setTimeout(() => setMoreOpen(false), 0); return () => window.clearTimeout(timer); }, [pathname]);

  if (!visible) return null;

  const profile = /^\/mercado\/vendedor\/([^/]+)/.exec(pathname);
  const ownProfile = Boolean(profile && decodeURIComponent(profile[1]) === userId);
  const active = pathname === '/' || pathname.startsWith('/reels') ? 'inicio'
    : pathname.startsWith('/mi-perfil') || ownProfile ? 'perfil'
      : inFarm ? 'granja'
        : pathname.startsWith('/mercado') || pathname.startsWith('/facturas') || pathname.startsWith('/transferencias') ? 'mercado' : '';

  function openMore() {
    if (inFarm) { setMoreOpen(false); window.dispatchEvent(new CustomEvent('pico-criollo:open-more')); }
    else setMoreOpen(open => !open);
  }

  return (
    <>
      {moreOpen && <div className="m-dock-more" role="menu" aria-label="Más secciones">
        {MORE.map(item => <Link key={item.href} role="menuitem" href={item.href} onClick={() => setMoreOpen(false)}><Icon name={item.icon} size={18} />{item.label}</Link>)}
        <button type="button" role="menuitem" onClick={() => setMoreOpen(false)}><Icon name="close" size={18} />Cerrar menú</button>
      </div>}
      <nav className={`m-dock ${inFarm ? 'dock-farm' : ''}`} aria-label="Secciones principales">
        {ITEMS.map(item => <Link key={item.id} className={`m-dock-item ${!moreOpen && active === item.id ? 'is-active' : ''}`} href={item.href} aria-current={!moreOpen && active === item.id ? 'page' : undefined} onClick={() => setMoreOpen(false)}>
          <Icon name={item.icon} size={22} /><span>{item.label}</span>
        </Link>)}
        <button type="button" className={`m-dock-item m-dock-more-button ${moreOpen ? 'is-active' : ''}`} aria-expanded={moreOpen} aria-haspopup="menu" onClick={openMore}>
          <Icon name="menu" size={22} /><span>Más</span>
        </button>
      </nav>
    </>
  );
}
