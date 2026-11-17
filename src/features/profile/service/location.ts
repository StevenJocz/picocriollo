import { NotFoundError, ValidationError } from '../../../server/errors.ts';
import { assertActive } from '../../../server/guards.ts';
import type { Ctx, Deps } from '../../market/service/listings.ts';

// Ubicación de cada persona (ciudad y departamento) para mostrar primero, en los reels y el mercado, lo que está cerca.

import { COLOMBIA_PLACES, type Location } from './location-data.ts';
export { COLOMBIA_PLACES, type Location };

/** Minúsculas, sin tildes y sin espacios repetidos: «MEDELLÍN » y «medellin» son lo mismo. */
export const foldPlace = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-CO');

const KNOWN = new Map(COLOMBIA_PLACES.map(place => [foldPlace(place.city), place]));
const REGIONS = new Map(COLOMBIA_PLACES.map(place => [foldPlace(place.region!), place.region!]));
const PLACE_TEXT = /^[\p{L}\p{N}][\p{L}\p{N} .,'()-]*$/u;

/** Ciudad y departamento limpios. Una ciudad conocida completa su departamento; un lugar que no está en la lista se acepta tal cual. */
export function normalizeLocation(input: { city?: unknown; region?: unknown }): Location {
  const city = typeof input.city === 'string' ? input.city.replace(/\s+/g, ' ').trim() : '';
  const region = typeof input.region === 'string' ? input.region.replace(/\s+/g, ' ').trim() : '';
  if (city.length < 2 || city.length > 60 || !PLACE_TEXT.test(city)) throw new ValidationError('Escribe el nombre de tu ciudad o municipio (entre 2 y 60 letras).');
  if (region && (region.length > 60 || !PLACE_TEXT.test(region))) throw new ValidationError('El departamento no es válido.');
  const known = KNOWN.get(foldPlace(city));
  if (known) return { city: known.city, region: known.region };
  const knownRegion = region ? REGIONS.get(foldPlace(region)) : undefined;
  return { city, ...(region ? { region: knownRegion ?? region } : {}) };
}

/** Lugar de una zona escrita como «Rionegro, Antioquia»: la primera parte es la ciudad y la última, el departamento. */
export function parseZone(zone: string): Location | undefined {
  const parts = zone.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const known = KNOWN.get(foldPlace(parts[0]));
  return { city: known?.city ?? parts[0], ...(parts.length > 1 ? { region: parts[parts.length - 1] } : known ? { region: known.region } : {}) };
}

/** 0 = misma ciudad, 1 = mismo departamento, 2 = el resto (o sin dato). Sin ubicación propia no se prioriza nada (siempre 0). */
export function proximityBucket(viewer: Location | undefined, target: Location | string | undefined): 0 | 1 | 2 {
  if (!viewer?.city) return 0;
  const place = typeof target === 'string' ? parseZone(target) : target;
  if (!place?.city) return 2;
  if (foldPlace(place.city) === foldPlace(viewer.city)) return 0;
  const viewerRegion = viewer.region ?? KNOWN.get(foldPlace(viewer.city))?.region, targetRegion = place.region ?? KNOWN.get(foldPlace(place.city))?.region;
  return viewerRegion && targetRegion && foldPlace(viewerRegion) === foldPlace(targetRegion) ? 1 : 2;
}

/** Guarda (o quita, si la ciudad llega vacía) la ubicación de la cuenta. */
export async function setLocation(deps: Deps, ctx: Ctx, input: { city?: unknown; region?: unknown }): Promise<Location | undefined> {
  const clearing = input.city === '' || input.city === null;
  const next = clearing ? undefined : normalizeLocation(input);
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    const user = await tx.users.get(ctx.userId);
    if (!user) throw new NotFoundError('Cuenta no encontrada.');
    const updated = { ...user };
    delete updated.location;
    await tx.users.update(next ? { ...updated, location: next } : updated);
    return next;
  });
}
