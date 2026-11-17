'use client';
import Image from 'next/image';

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';

/** Foto de perfil redonda; sin foto muestra las iniciales. */
export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  return url
    ? <Image className="avatar" src={url} alt={`Foto de perfil de ${name}`} width={size} height={size} unoptimized style={{ width: size, height: size }} />
    : <span className="avatar avatar-fallback" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initialsOf(name)}</span>;
}
