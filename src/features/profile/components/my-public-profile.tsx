'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function MyPublicProfile() {
  const router = useRouter();
  const [message, setMessage] = useState('Abriendo tu perfil público…');

  useEffect(() => {
    let active = true;
    fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo consultar la sesión.');
        if (!active) return;
        if (body.user?.id) router.replace(`/mercado/vendedor/${encodeURIComponent(body.user.id)}`);
        else router.replace('/mi-granja?returnTo=/mi-perfil');
      })
      .catch(() => { if (active) setMessage('No se pudo abrir el perfil. Intenta de nuevo.'); });
    return () => { active = false; };
  }, [router]);

  return <main className="loading-state"><span className="spinner" />{message}</main>;
}
