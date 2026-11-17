import type { BirdLockRecord, Tx } from '../../../server/storage/types.ts';

// Una publicación puede tener varios bloqueos (un lote de aves bloquea cada ave). Todo se opera por publicación.
export const activeLocks = (tx: Tx, listingId: string): Promise<BirdLockRecord[]> => tx.locks.list({ listingId, status: 'active' });

export async function releaseLocks(tx: Tx, listingId: string, now: Date): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) await tx.locks.update({ ...lock, status: 'released', releasedAt: now.toISOString() });
}

export async function reserveLocks(tx: Tx, listingId: string, operationId: string): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) await tx.locks.update({ ...lock, operationId });
}

export async function freeOperationLocks(tx: Tx, listingId: string, operationId: string): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) {
    if (lock.operationId !== operationId) continue;
    const free: BirdLockRecord = { ...lock };
    delete free.operationId;
    await tx.locks.update(free);
  }
}
