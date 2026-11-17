// Búsqueda general de los reels: razas, tipo de ave, nombre, descripción, zona, texto de las publicaciones, etiquetas y nombre del criador.
// Sin acceso a datos ni imports de Next: se prueba con node --test.
import { SPECIES_LABELS, speciesOf } from '../../../models/species.ts';
import type { ListingRecord, PostRecord } from '../../../server/storage/types.ts';
import type { DemoMarketListing } from '../../market/service/demo-listings.ts';
import { PROVIDER_LABELS } from './video-links.ts';

const MAX_TERMS = 8, MAX_TERM = 40, MAX_QUERY = 200;

/** Minúsculas y sin tildes: «Criollá» y «criolla» son lo mismo. */
export const foldText = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-CO');

/** Palabras de la consulta: sin signos ni «#», plural simple («gallinas» → «gallina»), sin repetidas y con tope. */
export function searchTerms(raw: string): string[] {
  const words = foldText(raw.slice(0, MAX_QUERY)).replace(/[#,.;:()¿?¡!"'«»]/g, ' ').split(/\s+/).filter(Boolean);
  const terms: string[] = [];
  for (const word of words) {
    let term = word.slice(0, MAX_TERM);
    if (term.length > 3 && term.endsWith('s')) term = term.slice(0, -1);
    if (!terms.includes(term)) terms.push(term);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

/** Todos los términos deben aparecer en el texto (sin términos, todo coincide). */
export const matchesTerms = (text: string, terms: string[]): boolean => {
  if (!terms.length) return true;
  const haystack = foldText(text);
  return terms.every(term => haystack.includes(term));
};

const KIND_WORDS: Record<string, string> = { fixed: 'precio fijo venta', auction: 'subasta oferta puja', interest: 'publicacion de interes consultar' };
const ITEM_WORDS: Record<string, string> = { ave: 'ave individual', lote_aves: 'lote de aves', lote_pollitos: 'lote de pollitos pollito', lote_huevos: 'lote de huevos huevo fertil', insumo: 'insumo alimento cuido concentrado maiz equipo bebedero comedero incubadora viruta medicamento' };

export const postSearchText = (post: PostRecord, authorAlias: string): string => `${post.text} ${authorAlias}${post.embed ? ` video ${PROVIDER_LABELS[post.embed.provider]}` : ''}`;

export function listingSearchText(listing: ListingRecord, sellerAlias: string): string {
  const s = listing.snapshot as unknown as Record<string, unknown>;
  const parts: unknown[] = [s.title, s.name, s.breed, s.species ? SPECIES_LABELS[speciesOf(String(s.species))] : '', s.sex, s.code, s.ring, s.ageLabel, s.description, s.deliveryZone, s.healthNote, s.breeder,
    ITEM_WORDS[String(s.itemType ?? 'ave')], KIND_WORDS[listing.kind], 'mercado', s.quantity, listing.price || '', sellerAlias];
  if (Array.isArray(s.lotBirds)) for (const item of s.lotBirds as Record<string, unknown>[]) parts.push(item.name, item.breed, item.sex, item.code);
  return parts.filter(part => part !== undefined && part !== null && part !== '').join(' ');
}

export const sampleSearchText = (listing: DemoMarketListing): string => [listing.title, listing.itemType, listing.breed, listing.description, listing.sellerAlias, 'ejemplo muestra mercado'].join(' ');
