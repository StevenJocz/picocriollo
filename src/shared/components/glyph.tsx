import { Icon } from './icon';

// Marcador visual de un ave, un huevo o un lote cuando no hay foto: icono Lucide sobre un contenedor con degradado.
// Sustituye a los emojis que se usaban como icono (no se ven igual en todos los dispositivos ni encajan en el sistema visual).
export type GlyphKind = 'gallina' | 'gallo' | 'pollito' | 'huevos' | 'lote' | 'ave' | 'insumo';

const GLYPHS: Record<GlyphKind, { icon: string; tone: 'green' | 'gold' | 'rose' | 'blue' }> = {
  gallina: { icon: 'bird', tone: 'green' },
  gallo: { icon: 'bird', tone: 'gold' },
  pollito: { icon: 'sprout', tone: 'gold' },
  huevos: { icon: 'egg', tone: 'rose' },
  lote: { icon: 'boxes', tone: 'blue' },
  insumo: { icon: 'wheat', tone: 'gold' },
  ave: { icon: 'bird', tone: 'green' },
};

export const glyphForSex = (sex?: string): GlyphKind => (sex === 'Gallo' ? 'gallo' : sex === 'Pollito' ? 'pollito' : sex === 'Gallina' ? 'gallina' : 'ave');
export const glyphForItem = (itemType?: string, sex?: string): GlyphKind =>
  itemType === 'insumo' ? 'insumo' : itemType === 'lote_huevos' ? 'huevos' : itemType === 'lote_pollitos' ? 'pollito' : itemType === 'lote_aves' ? 'lote' : glyphForSex(sex);

/** Se adapta al tamaño del contenedor (`size` en px lo fija; sin `size`, ocupa ~58 % del ancho disponible). */
export function BirdGlyph({ kind, size, className = '' }: { kind: GlyphKind; size?: number; className?: string }) {
  const glyph = GLYPHS[kind] ?? GLYPHS.ave;
  return (
    <span className={`glyph ib-${glyph.tone} ${className}`} style={size ? { width: size, height: size } : undefined} role="img" aria-label={kind}>
      <Icon name={glyph.icon} size={size ? Math.round(size * 0.52) : 28} />
    </span>
  );
}
