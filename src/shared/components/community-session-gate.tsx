'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { localDemoAuth } from '@/features/auth/service/local-demo-auth';

export function CommunitySessionGate({ children, returnTo }: { children: ReactNode; returnTo: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const localDemo = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOCAL_DEMO === 'true';

  useEffect(() => {
    let active = true;
    if (localDemo) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        if (localDemoAuth.currentUser()) setReady(true);
        else router.replace(`/mi-granja?returnTo=${encodeURIComponent(returnTo)}`);
      }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo comprobar la sesión.');
        if (!active) return;
        if (body.user) setReady(true);
        else router.replace(`/mi-granja?returnTo=${encodeURIComponent(returnTo)}`);
      })
      .catch(() => {
        if (active) router.replace(`/mi-granja?returnTo=${encodeURIComponent(returnTo)}`);
      });
    return () => { active = false; };
  }, [localDemo, returnTo, router]);

  if (!ready) return <main className="auth-screen"><div className="loading-state"><span className="spinner"/>Comprobando tu sesión…</div></main>;
  return children;
}
