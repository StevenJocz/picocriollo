'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';

type Phase = 'checking' | 'invalid' | 'form' | 'done';

// Pantalla a la que llega el enlace del correo: comprueba el enlace, pide la contraseña nueva y avisa al terminar.
export function ResetPasswordScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>(token ? 'checking' : 'invalid'), [password, setPassword] = useState(''), [again, setAgain] = useState(''), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`/api/auth?reset=${encodeURIComponent(token)}`, { credentials: 'same-origin' })
      .then(response => response.json()).then(body => { if (alive) setPhase(body.valid ? 'form' : 'invalid'); })
      .catch(() => { if (alive) { setPhase('form'); } });
    return () => { alive = false; };
  }, [token]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== again) { setError('Las dos contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', token, password }) });
      const body = await response.json();
      if (!response.ok) { if (response.status === 400 && /enlace/i.test(body.error || '')) setPhase('invalid'); throw new Error(body.error || 'No se pudo cambiar la contraseña.'); }
      setPassword(''); setAgain(''); setPhase('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.'); } finally { setBusy(false); }
  }
  return <main className="auth-screen auth-reset" data-step="form">
    <div className="auth-bg" aria-hidden="true"><i /><i /><i /><i /></div>
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark"><Icon name="bird" size={25} /></span><div><strong>Pico Criollo</strong><small>Gestión de granja</small></div></div>
      {phase === 'checking' && <><h1>Revisando tu enlace…</h1><p className="auth-wait" aria-busy="true"><i /><i /><i /></p></>}
      {phase === 'invalid' && <><span className="auth-status is-bad"><Icon name="alert" size={26} /></span><h1>Este enlace ya no sirve</h1><p>Los enlaces duran 30 minutos y se usan una sola vez. Pide uno nuevo desde «¿Olvidaste tu contraseña?».</p><Link className="btn-primary auth-submit auth-link" href="/mi-granja">Volver a iniciar sesión</Link></>}
      {phase === 'form' && <><h1>Crea tu contraseña</h1><p>Usa 12 caracteres o más. Al guardarla, se cerrarán las sesiones abiertas de tu cuenta.</p>
        <form onSubmit={e => void submit(e)}>
          <label className="form-field"><span>Contraseña nueva</span><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} placeholder="Al menos 12 caracteres" /></label>
          <label className="form-field"><span>Repítela</span><input type={show ? 'text' : 'password'} value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} placeholder="Escríbela otra vez" /></label>
          <label className="auth-show"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Mostrar contraseñas</label>
          {error && <p className="auth-error" role="alert"><Icon name="alert" size={17} />{error}</p>}
          <button className="btn-primary auth-submit" disabled={busy} aria-busy={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        </form></>}
      {phase === 'done' && <><span className="auth-status is-ok"><Icon name="check-circle" size={26} /></span><h1>¡Listo!</h1><p>Tu contraseña se cambió. Ya puedes entrar con la nueva.</p><Link className="btn-primary auth-submit auth-link" href="/mi-granja">Entrar a mi granja</Link></>}
    </section>
  </main>;
}
