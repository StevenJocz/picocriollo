'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Nombre de usuario que lleva a su perfil público. Dentro de la aplicación abre en otra pestaña para no cerrar chats ni vistas. */
export function UserLink({ id, name, newTab = true, children }: { id?: string; name: string; newTab?: boolean; children?: ReactNode }) {
  if (!id) return <>{children ?? name}</>;
  return (
    <Link className="user-link" href={`/mercado/vendedor/${id}`} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={event => event.stopPropagation()} title={`Ver el perfil de ${name}`}>
      {children ?? name}
    </Link>
  );
}
