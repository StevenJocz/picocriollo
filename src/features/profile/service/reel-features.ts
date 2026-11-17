import { BREEDS_BY_SPECIES, SPECIES } from '../../../models/species.ts';
import type { ListingRecord, MediaItemRecord, PostRecord } from '../../../server/storage/types.ts';
import { foldText } from './reel-search.ts';

// Etiquetas de contenido de un reel: es lo que el sistema aprende de cada persona («le gustan los gallos Brahma, los videos, el mercado…»).

const BREED_NAMES = [...new Set(SPECIES.flatMap(species => BREEDS_BY_SPECIES[species]))]
  .filter(name => !['Otra', 'Cruce', 'Criollo', 'Criolla'].includes(name))
  .map(name => ({ tag: `breed:${foldText(name).replace(/\s*\(.*\)$/, '').replace(/\s+/g, '-')}`, needle: foldText(name).replace(/\s*\(.*\)$/, '') }));
const SPECIES_WORDS: [string, RegExp][] = [
  ['patos', /\bpat[oa]s?\b/], ['gansos', /\bgans[oa]s?\b/], ['pavos', /\b(pavos?|pavas?|piscos?)\b/], ['codornices', /\bcodorni(z|ces)\b/], ['pintadas', /\bpintadas?\b/], ['palomas', /\bpalom[oa]s?\b/],
  ['gallinas', /\b(gallinas?|gallos?|pollit[oa]s?)\b/],
];

/** Etiquetas del texto de una publicación: #hashtags, razas y tipos de ave que menciona. */
export function textTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) tags.add(`#${foldText(match[1])}`);
  const folded = foldText(text);
  for (const breed of BREED_NAMES) if (breed.needle.length >= 4 && folded.includes(breed.needle)) tags.add(breed.tag);
  for (const [species, pattern] of SPECIES_WORDS) if (pattern.test(folded)) tags.add(`species:${species}`);
  if (/\b(huevos?|fertil(es)?)\b/.test(folded)) tags.add('#huevos');
  return [...tags];
}

/** Tipo de contenido de una publicación: video propio, video enlazado, foto o solo texto. */
export function postKindTag(post: PostRecord, media: Map<string, MediaItemRecord>): string {
  if (post.embed) return 'type:youtube';
  const first = post.mediaIds.length ? media.get(post.mediaIds[0]) : undefined;
  if (first) return first.kind === 'video' ? 'type:video' : 'type:foto';
  return post.demoImageUrl ? 'type:foto' : 'type:texto';
}

export function postFeatures(post: PostRecord, media: Map<string, MediaItemRecord>, original?: PostRecord): string[] {
  const source = original ?? post;
  const tags = new Set([...textTags(source.text), ...(original ? textTags(post.text) : []), postKindTag(source, media)]);
  if (original) tags.add('type:compartido');
  return [...tags];
}

/** Etiquetas de un aviso del mercado: raza, tipo de ave, tipo de aviso y, en insumos, su categoría. */
export function listingFeatures(listing: Pick<ListingRecord, 'snapshot' | 'itemType'>): string[] {
  const s = listing.snapshot, tags = new Set(['type:mercado', `item:${listing.itemType ?? 'ave'}`]);
  if (listing.itemType === 'insumo') tags.add(`cat:${foldText(s.breed)}`);
  else {
    if (s.breed) tags.add(`breed:${foldText(s.breed).replace(/\s*\(.*\)$/, '').replace(/\s+/g, '-')}`);
    tags.add(`species:${foldText(s.species ?? 'Gallinas')}`);
  }
  return [...tags];
}
