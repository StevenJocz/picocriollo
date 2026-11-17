import { randomUUID } from 'node:crypto';
import type { Category, NotificationLink, OutboxRecord, Priority, Tx } from '../../../server/storage/types.ts';

export interface RenderedNotification { title: string; body: string; link: NotificationLink; }
export interface EventDef {
  category: Category;
  priority: Priority;
  /** Crítica: ignora las preferencias de categoría (seguridad e integridad comercial). */
  critical: boolean;
  /** Preferencia comercial que puede silenciar este evento. */
  preference?: 'offers' | 'interests';
  recipients(tx: Tx, event: OutboxRecord): Promise<string[]>;
  render(tx: Tx, event: OutboxRecord, recipientId: string): Promise<RenderedNotification>;
}
export type EventRegistry = Record<string, EventDef>;

export interface EventInput {
  type: string; aggregateType: string; aggregateId: string;
  payload: Record<string, unknown>; dedupeKey: string; now: Date;
}

// Se llama dentro de la transacción de negocio: si esa transacción falla, el evento tampoco existe.
// Un dedupeKey repetido no crea otro evento (devuelve false).
export async function emit(tx: Tx, input: EventInput): Promise<boolean> {
  if ((await tx.outbox.list({ dedupeKey: input.dedupeKey })).length) return false;
  await tx.outbox.insert({
    id: randomUUID(), type: input.type, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
    payload: input.payload, dedupeKey: input.dedupeKey, status: 'pending', attempts: 0, occurredAt: input.now.toISOString(),
  });
  return true;
}
