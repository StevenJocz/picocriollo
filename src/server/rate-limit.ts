import { ConflictError } from './errors.ts';
import type { Tx } from './storage/types.ts';

// Límites de uso por acción, contados sobre el registro de auditoría (cada acción relevante ya deja una fila).
export const LIMITS = {
  'listing.create': { max: 20, windowMs: 24 * 3_600_000, label: 'publicaciones nuevas por día' },
  'auction.bid': { max: 30, windowMs: 3_600_000, label: 'ofertas por hora' },
  'operation.request': { max: 10, windowMs: 3_600_000, label: 'solicitudes de compra por hora' },
  'report.create': { max: 10, windowMs: 24 * 3_600_000, label: 'denuncias por día' },
  'media.upload': { max: 120, windowMs: 3_600_000, label: 'archivos subidos por hora' },
  'comment.create': { max: 60, windowMs: 3_600_000, label: 'comentarios por hora' },
  'post.create': { max: 30, windowMs: 24 * 3_600_000, label: 'publicaciones del perfil por día' },
  'post.share': { max: 40, windowMs: 24 * 3_600_000, label: 'reels compartidos por día' },
  'social.follow': { max: 200, windowMs: 3_600_000, label: 'acciones de seguimiento por hora' },
} as const;
export type LimitedAction = keyof typeof LIMITS;

export async function assertRate(tx: Tx, actorId: string, action: LimitedAction, now: Date): Promise<void> {
  const limit = LIMITS[action];
  const since = now.getTime() - limit.windowMs;
  const used = (await tx.audit.list({ actorId })).filter(row => row.action === action && new Date(row.createdAt).getTime() >= since).length;
  if (used >= limit.max) throw new ConflictError(`Llegaste al límite de ${limit.max} ${limit.label}. Inténtalo más tarde.`);
}
