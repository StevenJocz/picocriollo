'use client';
import { useState } from 'react';
import Image from 'next/image';
import { BirdGlyph, type GlyphKind } from './glyph';

// Foto de ranura: si el archivo de /public/fotos todavía no existe (o falla al cargar), muestra un glifo (icono sobre degradado) sin romper el diseño.
// Los nombres de archivo esperados y sus medidas están en public/fotos/LEEME.md.
export function Photo({ src, alt, fallback, className, width, height, priority }: { src: string; alt: string; fallback: GlyphKind; className?: string; width: number; height: number; priority?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className={`photo-fallback ${className ?? ''}`} role="img" aria-label={alt || fallback}><BirdGlyph kind={fallback} /></span>;
  return <Image className={className} src={src} alt={alt} width={width} height={height} priority={priority} unoptimized onError={() => setMissing(true)} />;
}
