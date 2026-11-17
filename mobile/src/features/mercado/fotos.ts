import { urlAbsoluta } from '@/api/cliente';

export function fotosPublicacion(ficha?: { photoUrl?: string | null; photoUrls?: string[] | null } | null): string[] {
  return [...new Set([...(ficha?.photoUrls ?? []), ficha?.photoUrl].filter((f): f is string => !!f))].map(urlAbsoluta).filter((f): f is string => !!f);
}
