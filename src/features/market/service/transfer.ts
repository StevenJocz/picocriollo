import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Bird, BirdEvent, ChickLot, CustomProduct, FarmData, FertileEggLot, RingAssignment } from '../../../models/farm.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../server/errors.ts';
import type { ListingRecord, OperationRecord, Store, Tx, TransferReceiptRecord } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import { aliasOf, findBird } from './snapshot.ts';
import type { FarmJson } from './snapshot.ts';
import { activeLocks, releaseLocks } from './locks.ts';
import { itemTypeOf, itemsOf } from './items.ts';
import { issueInvoice } from './invoices.ts';

const farmOf = (data: FarmJson) => data as unknown as FarmData;
const day = (now: Date) => now.toISOString().slice(0, 10);

function receiptCode(now: Date): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return `TRF-${day(now).replace(/-/g, '')}-${[...bytes].map(b => letters[b % letters.length]).join('')}`;
}

export interface ReceiptContent { code: string; birdId: string; birdCode: string; birdName: string; ring: number | null; sellerAlias: string; buyerAlias: string; price: number; transferredAt: string; operationId: string; }
export const receiptHash = (content: ReceiptContent): string => createHash('sha256').update(JSON.stringify(content, Object.keys(content).sort())).digest('hex');

function ancestors(data: FarmData, id: string, depth: number): Record<string, unknown> | undefined {
  const bird = data.birds.find(item => item.id === id);
  if (!bird) return undefined;
  return { id: bird.id, name: bird.name, code: bird.code ?? '', breed: bird.breed, sex: bird.sex, bornAt: bird.bornAt, ...(depth > 1 ? { mother: ancestors(data, bird.motherId, depth - 1), father: ancestors(data, bird.fatherId, depth - 1) } : {}) };
}

const STOCK_KEYS = ['chickLots', 'fertileLots', 'lotMovements', 'customProducts'] as const;
function ensureStock(farm: FarmData) { for (const key of STOCK_KEYS) if (!Array.isArray(farm[key])) (farm as unknown as Record<string, unknown[]>)[key] = []; }

/** Código de lote para la granja del comprador (mismo formato PREFIJO-0001-TOKEN8 que el resto de códigos). */
function lotCode(prefix: 'POL' | 'FER', taken: Set<string>): string {
  let ordinal = taken.size + 1, code = '';
  do { code = `${prefix}-${String(ordinal++).padStart(4, '0')}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; } while (taken.has(code));
  return code;
}

interface Moved { birdId: string; ring: number | null; ringKept: boolean; sharedHistory: number; }

/** Mueve un ave de la granja del vendedor a la del comprador (anillo, historial autorizado, lápida, propiedad y pasaporte). */
async function moveBird(tx: Tx, op: OperationRecord, listing: ListingRecord, sFarm: FarmData, bFarm: FarmData, birdId: string, sellerAlias: string, today: string, at: string): Promise<Moved> {
  const ownership = await tx.ownership.get(birdId);
  if (!ownership || ownership.ownerId !== op.sellerId) throw new ConflictError('El vendedor ya no es el propietario actual del ave: la transferencia se bloqueó.');
  const bird = sFarm.birds.find(item => item.id === birdId);
  if (!bird) throw new ConflictError('El ave ya no existe en la granja del vendedor.');
  if (['Vendido', 'Fallecido', 'Transferido'].includes(bird.status)) throw new ConflictError(`El ave está ${bird.status.toLowerCase()} y no se puede transferir.`);
  if (bFarm.birds.some(item => item.id === bird.id)) throw new ConflictError('El comprador ya tiene registrada esta ave.');

  // Anillo: se conserva el número. Si ya está ocupado en la granja del comprador no se pisa nada.
  const currentRing = sFarm.rings.find(ring => ring.birdId === bird.id && ring.status === 'Asignado' && !ring.endedAt);
  const ringHistory = sFarm.rings.filter(ring => ring.birdId === bird.id).map(ring => ({ number: ring.number, assignedAt: ring.assignedAt, endedAt: ring.endedAt ?? null }));
  let ringNote = '';
  if (currentRing) {
    const taken = bFarm.rings.some(ring => ring.number === currentRing.number && ring.status !== 'Retirado' && !ring.endedAt);
    if (taken) ringNote = `Anillo ${currentRing.number} pendiente de reasignar: ese número ya está en uso en tu granja. El número original quedó en el pasaporte del ave.`;
    else bFarm.rings.unshift({ id: `ring-${randomUUID()}`, number: currentRing.number, birdId: bird.id, status: 'Asignado', assignedAt: today, notes: `Anillo original conservado en la transferencia desde ${sellerAlias}.` } satisfies RingAssignment);
    currentRing.status = 'Retirado'; currentRing.endedAt = today; currentRing.notes = 'Retirado por transferencia de propiedad.';
  }

  // Historial autorizado por el vendedor al publicar. Las observaciones, ventas y clientes nunca viajan.
  const consent = listing.consent;
  const sharedKinds = [...(consent.shareHistoryReproductive ? ['Reproductivo'] : []), ...(consent.shareHistoryHealth ? ['Salud'] : [])];
  const history: BirdEvent[] = sFarm.birdEvents.filter(event => event.birdId === bird.id && sharedKinds.includes(event.kind)).map(event => ({ ...event, id: `evt-${randomUUID()}`, transferredFrom: sellerAlias }));
  bFarm.birdEvents.unshift(...history);

  const moved: Bird = { ...bird, coopId: '', status: 'Activo', notes: ringNote, origin: `Transferida por ${sellerAlias} el ${today}. Procedencia declarada: ${bird.origin || 'sin dato'}` };
  bFarm.birds.unshift(moved);
  sFarm.birds[sFarm.birds.findIndex(item => item.id === bird.id)] = { ...bird, status: 'Transferido' };

  // Propiedad y trazabilidad
  for (const row of await tx.ownershipHistory.list({ birdId: bird.id })) if (!row.to && row.ownerId === op.sellerId) await tx.ownershipHistory.update({ ...row, to: at });
  await tx.ownershipHistory.insert({ id: `${bird.id}:${at}:${op.buyerId.slice(0, 8)}`, birdId: bird.id, ownerId: op.buyerId, from: at, operationId: op.id });
  await tx.ownership.update({ ...ownership, ownerId: op.buyerId, since: at, version: ownership.version + 1 });
  const passport = (await tx.passports.list({ birdId: bird.id }))[0];
  const lineage = { mother: ancestors(sFarm, bird.motherId, 2) ?? null, father: ancestors(sFarm, bird.fatherId, 2) ?? null, ringHistory, birthDate: bird.bornAt, breed: bird.breed, declaredBy: sellerAlias };
  if (passport) await tx.passports.update({ ...passport, originRing: passport.originRing ?? currentRing?.number ?? null, lineage: { ...passport.lineage, ...lineage }, updatedAt: at });
  else await tx.passports.insert({ id: `passport-${bird.id}`, birdId: bird.id, code: bird.code ?? '', originRing: currentRing?.number ?? null, lineage, updatedAt: at });
  return { birdId: bird.id, ring: currentRing?.number ?? null, ringKept: Boolean(currentRing) && !ringNote, sharedHistory: history.length };
}

/** Descuenta la cantidad del lote del vendedor y crea un lote nuevo, sin gallinero, en la granja del comprador. */
function moveSupply(sFarm: FarmData, bFarm: FarmData, item: { lotId: string; quantity: number }): { code: string } {
  const product = sFarm.customProducts.find(row => row.id === item.lotId);
  if (!product) throw new ConflictError('El insumo ya no existe en la granja del vendedor.');
  if (product.available < item.quantity) throw new ConflictError('El insumo ya no tiene la cantidad publicada: la transferencia se bloqueó.');
  product.available -= item.quantity;
  // El comprador suma a un registro igual (mismo nombre y unidad) o recibe uno nuevo, propio.
  const same = bFarm.customProducts.find((row: CustomProduct) => row.name === product.name && row.unit === product.unit);
  if (same) { same.available += item.quantity; return { code: same.code }; }
  const taken = new Set(bFarm.customProducts.map(row => row.code));
  let ordinal = taken.size + 1, code = '';
  do { code = `PRO-${String(ordinal++).padStart(4, '0')}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; } while (taken.has(code));
  bFarm.customProducts.unshift({ id: `product-${randomUUID()}`, code, name: product.name, category: product.category, unit: product.unit, price: product.price, available: item.quantity });
  return { code };
}

function moveStock(op: OperationRecord, sFarm: FarmData, bFarm: FarmData, item: { type: 'lote_pollitos' | 'lote_huevos' | 'insumo'; lotId: string; quantity: number }, sellerAlias: string, buyerAlias: string, today: string): { code: string } {
  if (item.type === 'insumo') return moveSupply(sFarm, bFarm, item);
  const lots = (item.type === 'lote_pollitos' ? sFarm.chickLots : sFarm.fertileLots) as (ChickLot | FertileEggLot)[];
  const lot = lots.find(row => row.id === item.lotId);
  if (!lot) throw new ConflictError('El lote ya no existe en la granja del vendedor.');
  if (lot.available < item.quantity) throw new ConflictError('El lote ya no tiene la cantidad publicada: la transferencia se bloqueó.');
  lot.available -= item.quantity; lot.sold += item.quantity;
  sFarm.lotMovements.unshift({ id: `mov-${randomUUID()}`, date: today, lotId: lot.id, kind: 'Vendido', quantity: item.quantity, referenceId: op.id, notes: `Venta en el mercado a ${buyerAlias}` });
  const taken = new Set([...bFarm.chickLots, ...bFarm.fertileLots].map(row => row.code));
  const notes = `Transferido por ${sellerAlias} el ${today}. Datos del lote declarados por el vendedor.`;
  if (item.type === 'lote_pollitos') {
    const code = lotCode('POL', taken);
    bFarm.chickLots.unshift({ id: `chick-lot-${randomUUID()}`, code, birthId: '', sourceLotIds: [], incubationId: '', breed: lot.breed, initial: item.quantity, available: item.quantity, sold: 0, coopId: '', notes });
    return { code };
  }
  const eggs = lot as FertileEggLot, code = lotCode('FER', taken);
  bFarm.fertileLots.unshift({ id: `fertile-lot-${randomUUID()}`, code, sourceCollectionId: '', productType: eggs.productType, date: today, coopId: '', breed: eggs.breed, initial: item.quantity, available: item.quantity, sold: 0, incubated: 0, discarded: 0, fertility: eggs.fertility, storageNotes: '', notes });
  return { code };
}

/**
 * Transferencia de propiedad. Se ejecuta DENTRO de la transacción que confirma la recepción: o ocurre todo o nada.
 * Aves: el mismo id y código pasan al comprador. Lotes de pollitos/huevos: se descuenta del lote del vendedor y se crea uno nuevo.
 */
export async function executeTransfer(tx: Tx, op: OperationRecord, now: Date): Promise<TransferReceiptRecord> {
  const listing = await tx.listings.get(op.listingId);
  if (!listing || listing.birdId !== op.birdId) throw new ConflictError('La operación no corresponde al ave publicada.');
  if (op.status !== 'entrega_confirmada' || !op.paymentConfirmedAt || !op.sellerDeliveredAt) throw new ConflictError('Faltan confirmaciones de pago o entrega para transferir.');
  if (!(await activeLocks(tx, listing.id)).some(item => item.operationId === op.id)) throw new ConflictError('La publicación no está reservada para esta operación.');

  const sellerFarm = await tx.farms.get(op.sellerId), buyerFarm = await tx.farms.get(op.buyerId);
  if (!sellerFarm || !buyerFarm) throw new NotFoundError('No existe la granja de una de las partes.');
  const seller = (await tx.users.get(op.sellerId))!, buyer = (await tx.users.get(op.buyerId))!;
  const sellerData = structuredClone(sellerFarm.data) as FarmJson, buyerData = structuredClone(buyerFarm.data) as FarmJson;
  const sFarm = farmOf(sellerData), bFarm = farmOf(buyerData);
  ensureStock(sFarm); ensureStock(bFarm);
  const sellerAlias = aliasOf(seller), buyerAlias = aliasOf(buyer), today = day(now), at = now.toISOString();
  const type = itemTypeOf(listing), items = itemsOf(listing);

  const moved: Moved[] = [];
  let lotCodeOut = '';
  if (type === 'ave' || type === 'lote_aves') {
    for (const item of items) if (item.type === 'ave') moved.push(await moveBird(tx, op, listing, sFarm, bFarm, item.birdId, sellerAlias, today, at));
  } else {
    lotCodeOut = moveStock(op, sFarm, bFarm, items[0] as { type: 'lote_pollitos' | 'lote_huevos' | 'insumo'; lotId: string; quantity: number }, sellerAlias, buyerAlias, today).code;
  }
  await tx.farms.update({ ...sellerFarm, data: sellerData, version: sellerFarm.version + 1, updatedAt: at });
  await tx.farms.update({ ...buyerFarm, data: buyerData, version: buyerFarm.version + 1, updatedAt: at });

  // Publicación, bloqueos y comprobante
  await releaseLocks(tx, listing.id, now);
  await tx.listings.update({ ...listing, status: 'vendida', closedReason: 'transferida', updatedAt: at, version: listing.version + 1 });
  const single = type === 'ave' ? moved[0] : undefined;
  const singleBird = single ? findBird(sellerData, single.birdId)! : undefined;
  const content: ReceiptContent = {
    code: receiptCode(now), birdId: single ? single.birdId : listing.birdId, birdCode: singleBird ? singleBird.code ?? '' : listing.snapshot.code ?? '',
    birdName: singleBird ? singleBird.name : listing.snapshot.title ?? listing.snapshot.name, ring: single?.ring ?? null,
    sellerAlias, buyerAlias, price: op.price, transferredAt: at, operationId: op.id,
  };
  const receipt: TransferReceiptRecord = { id: randomUUID(), code: content.code, birdId: content.birdId, operationId: op.id, listingId: listing.id, sellerId: op.sellerId, buyerId: op.buyerId, sellerAlias, buyerAlias, birdName: content.birdName, birdCode: content.birdCode, ring: content.ring, price: op.price, transferredAt: at, hash: receiptHash(content) };
  await tx.receipts.insert(receipt);
  await issueInvoice(tx, op, listing, receipt, now, sellerData);
  await tx.audit.insert({ id: randomUUID(), actorId: op.buyerId, action: 'transfer.complete', targetType: single ? 'bird' : 'listing', targetId: single ? single.birdId : listing.id, detail: { operationId: op.id, from: op.sellerId, to: op.buyerId, receipt: receipt.code, itemType: type, birdIds: moved.map(item => item.birdId), lotCode: lotCodeOut || null, sharedHistoryEvents: moved.reduce((sum, item) => sum + item.sharedHistory, 0), ringKept: moved.some(item => item.ringKept) }, createdAt: at });
  await emit(tx, { type: 'market.transfer.completed', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, receiptCode: receipt.code }, dedupeKey: `transfer-completed:${op.id}`, now });
  return receipt;
}

export function verifyReceipt(receipt: TransferReceiptRecord): boolean {
  const content: ReceiptContent = { code: receipt.code, birdId: receipt.birdId, birdCode: receipt.birdCode, birdName: receipt.birdName, ring: receipt.ring, sellerAlias: receipt.sellerAlias, buyerAlias: receipt.buyerAlias, price: receipt.price, transferredAt: receipt.transferredAt, operationId: receipt.operationId };
  return receiptHash(content) === receipt.hash;
}

/** Comprobante visible solo para las dos partes. Devuelve también si el contenido coincide con su huella. */
export async function getReceipt(store: Store, userId: string, code: string) {
  return store.tx(async tx => {
    const receipt = (await tx.receipts.list({ code }))[0];
    if (!receipt) throw new NotFoundError('Comprobante no encontrado.');
    if (receipt.sellerId !== userId && receipt.buyerId !== userId) throw new ForbiddenError('Este comprobante no es tuyo.');
    return { sellerId: receipt.sellerId, buyerId: receipt.buyerId, code: receipt.code, birdName: receipt.birdName, birdCode: receipt.birdCode, ring: receipt.ring, sellerAlias: receipt.sellerAlias, buyerAlias: receipt.buyerAlias, price: receipt.price, transferredAt: receipt.transferredAt, hash: receipt.hash, integrity: verifyReceipt(receipt), role: receipt.sellerId === userId ? 'vendedor' : 'comprador' };
  });
}

/** Procedencia: línea declarada de ancestros y quién fue propietario en cada periodo. Solo propietarios actuales o anteriores. */
export async function getProvenance(store: Store, userId: string, birdId: string) {
  return store.tx(async tx => {
    const history = (await tx.ownershipHistory.list({ birdId })).sort((a, b) => a.from.localeCompare(b.from));
    if (!history.some(row => row.ownerId === userId)) throw new ForbiddenError('Solo quienes han sido propietarios del ave ven su procedencia.');
    const owners = [];
    for (const row of history) { const user = await tx.users.get(row.ownerId); owners.push({ alias: user ? aliasOf(user) : 'Criador', from: row.from, to: row.to ?? null, mine: row.ownerId === userId, viaOperation: Boolean(row.operationId) }); }
    const passport = (await tx.passports.list({ birdId }))[0];
    return { birdId, owners, passport: passport ? { code: passport.code, originRing: passport.originRing, lineage: passport.lineage, updatedAt: passport.updatedAt } : null };
  });
}
