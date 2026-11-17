import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../server/errors.ts';
import type { RatingRecord, Store, Tx } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import type { Ctx } from './listings.ts';
import { containsContactInfo } from './messages.ts';
import { aliasOf } from './snapshot.ts';

export const RATING_WINDOW_MS = 14 * 86_400_000;
/** Máximo de valoraciones de una misma persona hacia otra que cuentan para el promedio (evita inflarlo entre cuentas amigas). */
export const PAIR_CAP = 3;

export interface Reputation { count: number; average: number; completed: number; distribution: [number, number, number, number, number]; }

/** Promedio con tope por pareja valorador→valorado. Función pura para poder probarla. */
export function reputationFrom(ratings: Pick<RatingRecord, 'raterId' | 'rateeId' | 'stars' | 'createdAt'>[], completed: number): Reputation {
  const perPair = new Map<string, number>();
  const distribution: Reputation['distribution'] = [0, 0, 0, 0, 0];
  let sum = 0, count = 0;
  for (const rating of [...ratings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${rating.raterId}>${rating.rateeId}`, used = perPair.get(key) ?? 0;
    if (used >= PAIR_CAP) continue;
    perPair.set(key, used + 1);
    sum += rating.stars; count++; distribution[rating.stars - 1] += 1;
  }
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, completed, distribution };
}

export async function reputationIn(tx: Tx, userId: string): Promise<Reputation> {
  const ratings = await tx.ratings.list({ rateeId: userId });
  const completed = (await tx.operations.list({ sellerId: userId })).filter(op => op.status === 'completada').length + (await tx.operations.list({ buyerId: userId })).filter(op => op.status === 'completada').length;
  return reputationFrom(ratings, completed);
}

/** Reputación como vendedor: valoraciones que recibió de compradores y ventas completadas. */
export async function sellerReputationIn(tx: Tx, sellerId: string): Promise<Reputation> {
  const ops = (await tx.operations.list({ sellerId })).filter(op => op.status === 'completada');
  const byOp = new Set(ops.map(op => op.id));
  const ratings = (await tx.ratings.list({ rateeId: sellerId })).filter(row => byOp.has(row.operationId));
  return reputationFrom(ratings, ops.length);
}

export const reputationOf = (store: Store, userId: string) => store.tx(tx => reputationIn(tx, userId));

function completedAt(op: { history: { at: string; status: string }[] }): string | undefined {
  return op.history.find(entry => entry.status === 'completada')?.at;
}

/** Una opinión se publica cuando ambas partes valoraron o venció el plazo (evita represalias). */
export function reviewVisible(op: { history: { at: string; status: string }[] }, ratingsOfOp: Pick<RatingRecord, 'raterId'>[], now: Date): boolean {
  if (new Set(ratingsOfOp.map(row => row.raterId)).size >= 2) return true;
  const closed = completedAt(op);
  return Boolean(closed) && now.getTime() - new Date(closed!).getTime() > RATING_WINDOW_MS;
}

/** Valoración tras una operación real completada: una por parte y operación, dentro de 14 días. */
export async function rateOperation(store: Store, ctx: Ctx, operationId: string, input: { stars: unknown; comment?: unknown }): Promise<RatingRecord> {
  const stars = Number(input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ValidationError('La valoración debe ser un número entero de 1 a 5.');
  const comment = input.comment === undefined || input.comment === '' ? '' : typeof input.comment === 'string' ? input.comment.trim() : (() => { throw new ValidationError('El comentario no es válido.'); })();
  if (comment.length > 500) throw new ValidationError('El comentario supera 500 caracteres.');
  if (comment && containsContactInfo(comment)) throw new ValidationError('El comentario no puede incluir teléfonos ni correos.');
  return store.tx(async tx => {
    const op = await tx.operations.get(operationId);
    if (!op) throw new NotFoundError('Operación no encontrada.');
    if (op.buyerId !== ctx.userId && op.sellerId !== ctx.userId) throw new ForbiddenError('Solo las partes de una operación pueden valorarla.');
    if (op.status !== 'completada') throw new ConflictError('Solo se valoran operaciones completadas.');
    const closed = completedAt(op);
    if (!closed || ctx.now.getTime() - new Date(closed).getTime() > RATING_WINDOW_MS) throw new ConflictError('El plazo de 14 días para valorar esta operación terminó.');
    if ((await tx.ratings.list({ operationId })).some(row => row.raterId === ctx.userId)) throw new ConflictError('Ya valoraste esta operación.');
    const rateeId = op.buyerId === ctx.userId ? op.sellerId : op.buyerId;
    const rating: RatingRecord = { id: randomUUID(), operationId, raterId: ctx.userId, rateeId, stars, comment, createdAt: ctx.now.toISOString() };
    await tx.ratings.insert(rating);
    await tx.audit.insert({ id: randomUUID(), actorId: ctx.userId, action: 'rating.create', targetType: 'operation', targetId: operationId, detail: { stars }, createdAt: ctx.now.toISOString() });
    await emit(tx, { type: 'market.rating.received', aggregateType: 'operation', aggregateId: operationId, payload: { operationId, ratingId: rating.id }, dedupeKey: `rating:${rating.id}`, now: ctx.now });
    return rating;
  });
}

export interface RatingState { canRate: boolean; mine?: { stars: number; comment: string }; theirs?: { stars: number; comment: string }; }

/** La valoración de la otra parte se muestra solo cuando ya valoraste o cuando venció el plazo (evita represalias). */
export async function ratingStateIn(tx: Tx, op: { id: string; status: string; buyerId: string; sellerId: string; history: { at: string; status: string }[] }, userId: string, now: Date): Promise<RatingState> {
  if (op.status !== 'completada') return { canRate: false };
  const rows = await tx.ratings.list({ operationId: op.id });
  const mine = rows.find(row => row.raterId === userId), theirs = rows.find(row => row.raterId !== userId);
  const closed = completedAt(op);
  const open = Boolean(closed) && now.getTime() - new Date(closed!).getTime() <= RATING_WINDOW_MS;
  return { canRate: open && !mine, ...(mine ? { mine: { stars: mine.stars, comment: mine.comment } } : {}), ...(theirs && (mine || !open) ? { theirs: { stars: theirs.stars, comment: theirs.comment } } : {}) };
}

export async function publicProfile(store: Store, userId: string) {
  return store.tx(async tx => {
    const user = await tx.users.get(userId);
    if (!user) throw new NotFoundError('Criador no encontrado.');
    return { alias: aliasOf(user), reputation: await sellerReputationIn(tx, userId) };
  });
}
