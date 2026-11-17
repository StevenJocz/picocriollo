import assert from 'node:assert/strict';
import test from 'node:test';
import { closeDueAuctions, placeBid } from '../src/features/market/service/auction.ts';
import { createListing, myListings } from '../src/features/market/service/listings.ts';
import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, getContact, listOperations, markDelivered, openDispute, requestPurchase, respondPurchase, shareContact } from '../src/features/market/service/operations.ts';
import { getProvenance, getReceipt, receiptHash, verifyReceipt } from '../src/features/market/service/transfer.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { HOUR, at, ctx, deps, notes, publishAuction, status } from './helpers/market.ts';

const BIRD_ID = 'luna';
async function world(env: TestEnv, options: { buyerRing?: number; shareHealth?: boolean } = {}) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto', { contactPhone: '300 111 2222' });
  await env.saveFarm(ana, {
    birds: [
      bird({ id: 'madre', name: 'Reina', code: 'AVE-0001', breed: 'Brahma', sex: 'Gallina' }),
      bird({ id: BIRD_ID, name: 'Luna', code: 'AVE-0003', motherId: 'madre', notes: 'NOTA-PRIVADA-DEL-VENDEDOR', coopId: 'c1' }),
    ],
    rings: [{ id: 'r1', number: 7, birdId: BIRD_ID, status: 'Asignado', assignedAt: '2025-07-01' }],
    birdEvents: [
      { id: 'e1', birdId: BIRD_ID, kind: 'Reproductivo', date: '2026-02-01', title: 'Postura', details: 'Buena postura' },
      { id: 'e2', birdId: BIRD_ID, kind: 'Salud', date: '2026-03-01', title: 'Vacuna', details: 'DETALLE-SANITARIO' },
      { id: 'e3', birdId: BIRD_ID, kind: 'Observación', date: '2026-04-01', title: 'Nota', details: 'OBSERVACION-PRIVADA' },
    ],
    sales: [{ id: 's1', code: 'VEN-1' }], customers: [{ id: 'c1', name: 'CLIENTE-PRIVADO' }],
  });
  await env.saveFarm(beto, {
    birds: [bird({ id: 'beto-propia', name: 'Propia', code: 'AVE-7777' })],
    rings: options.buyerRing ? [{ id: 'br1', number: options.buyerRing, birdId: 'beto-propia', status: 'Asignado', assignedAt: '2026-01-01' }] : [],
  });
  const listing = await createListing(deps(env), ctx(env, ana), { birdId: BIRD_ID, kind: 'fixed', price: 85000, publish: true, consent: { shareHistoryReproductive: true, shareHistoryHealth: options.shareHealth ?? false } });
  return { ana, beto, listing };
}
async function toDelivered(env: TestEnv, w: Awaited<ReturnType<typeof world>>) {
  const op = await requestPurchase(env.store, ctx(env, w.beto), w.listing.id);
  await respondPurchase(env.store, ctx(env, w.ana), op.id, 'accept');
  await declarePayment(env.store, ctx(env, w.beto), op.id, 'Transferencia');
  await confirmPayment(env.store, ctx(env, w.ana), op.id);
  await markDelivered(env.store, ctx(env, w.ana), op.id);
  return op;
}
const activeBirdHolders = async (env: TestEnv, id: string) => {
  const farms = await env.store.tx(tx => tx.farms.list());
  return farms.filter(farm => (farm.data.birds as { id: string; status: string }[]).some(item => item.id === id && item.status !== 'Transferido')).map(farm => farm.id);
};

test('flujo completo: solicitud → pago manual → entrega → recepción transfiere la propiedad', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const op = await requestPurchase(env.store, ctx(env, w.beto), w.listing.id);
    assert.equal((await respondPurchase(env.store, ctx(env, w.ana), op.id, 'accept')).status, 'pago_pendiente');
    assert.equal((await declarePayment(env.store, ctx(env, w.beto), op.id, 'Transferencia')).status, 'pago_registrado');
    assert.equal((await confirmPayment(env.store, ctx(env, w.ana), op.id)).status, 'entrega_pendiente');
    assert.equal((await markDelivered(env.store, ctx(env, w.ana), op.id)).status, 'entrega_confirmada');
    // todavía nada se transfirió
    assert.equal((await env.store.tx(tx => tx.ownership.get(BIRD_ID)))?.ownerId, w.ana);
    const { operation, receiptCode } = await confirmReceipt(env.store, ctx(env, w.beto), op.id);
    assert.equal(operation.status, 'completada');
    assert.deepEqual(operation.history.map(h => h.status), ['solicitud_recibida', 'aceptada', 'pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada', 'completada']);

    assert.equal((await env.store.tx(tx => tx.ownership.get(BIRD_ID)))?.ownerId, w.beto);
    assert.deepEqual(await activeBirdHolders(env, BIRD_ID), [w.beto]); // un solo animal, no duplicado
    const buyerBirds = (await env.farm(w.beto)).birds as Record<string, unknown>[];
    const moved = buyerBirds.find(item => item.id === BIRD_ID)!;
    assert.equal(moved.code, 'AVE-0003'); assert.equal(moved.name, 'Luna'); assert.equal(moved.motherId, 'madre'); assert.equal(moved.status, 'Activo'); assert.equal(moved.coopId, '');
    assert.equal(String(moved.notes).includes('NOTA-PRIVADA'), false);
    const sellerBird = ((await env.farm(w.ana)).birds as Record<string, unknown>[]).find(item => item.id === BIRD_ID)!;
    assert.equal(sellerBird.status, 'Transferido');
    // el anillo viaja con el ave
    const buyerRings = (await env.farm(w.beto)).rings as { number: number; birdId: string; status: string }[];
    assert.ok(buyerRings.some(ring => ring.number === 7 && ring.birdId === BIRD_ID && ring.status === 'Asignado'));
    assert.equal(((await env.farm(w.ana)).rings as { status: string }[])[0].status, 'Retirado');
    // listado, bloqueo y comprobante
    assert.equal((await env.store.tx(tx => tx.listings.get(w.listing.id)))?.status, 'vendida');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: BIRD_ID, status: 'active' }))).length, 0);
    const receipt = await getReceipt(env.store, w.beto, receiptCode);
    assert.match(receipt.code, /^TRF-\d{8}-[A-Z2-9]{6}$/);
    assert.equal(receipt.integrity, true); assert.equal(receipt.price, 85000); assert.equal(receipt.ring, 7);
    assert.equal((await getReceipt(env.store, w.ana, receiptCode)).role, 'vendedor');
    assert.equal(JSON.stringify(receipt).includes('correo.test'), false);
    assert.equal((await listOperations(env.store, w.beto, 'comprador'))[0].receiptCode, receiptCode);
    // notificaciones a ambas partes, críticas
    for (const id of [w.ana, w.beto]) { const [n] = await notes(env, id, 'market.transfer.completed'); assert.equal(n.critical, true); assert.match(n.body, new RegExp(receiptCode)); }
    assert.equal((await notes(env, w.ana, 'market.operation.payment_declared')).length, 1);
    assert.equal((await notes(env, w.beto, 'market.operation.payment_confirmed')).length, 1);
    assert.equal((await notes(env, w.beto, 'market.operation.delivered')).length, 1);
    // la transferencia quedó auditada
    const audit = (await env.store.tx(tx => tx.audit.list({ targetId: BIRD_ID }))).find(row => row.action === 'transfer.complete');
    assert.equal((audit?.detail as { from: string }).from, w.ana);
  } finally { await env.cleanup(); }
});

test('el comprador recibe solo el historial autorizado; nada privado del vendedor viaja', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env, { shareHealth: false });
    const op = await toDelivered(env, w);
    await confirmReceipt(env.store, ctx(env, w.beto), op.id);
    const buyer = await env.farm(w.beto);
    const raw = JSON.stringify(buyer);
    assert.match(raw, /Buena postura/);                      // reproductivo autorizado
    for (const secret of ['DETALLE-SANITARIO', 'OBSERVACION-PRIVADA', 'NOTA-PRIVADA-DEL-VENDEDOR', 'CLIENTE-PRIVADO', 'VEN-1', 'correo.test']) assert.equal(raw.includes(secret), false, `viajó ${secret}`);
    const event = (buyer.birdEvents as { transferredFrom?: string }[])[0];
    assert.equal(event.transferredFrom, 'Ana');
  } finally { await env.cleanup(); }
});

test('con consentimiento sanitario también viaja el historial de salud', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env, { shareHealth: true });
    await confirmReceipt(env.store, ctx(env, w.beto), (await toDelivered(env, w)).id);
    assert.match(JSON.stringify(await env.farm(w.beto)), /DETALLE-SANITARIO/);
  } finally { await env.cleanup(); }
});

test('pasaporte y propietarios: genealogía declarada y quién fue dueño en cada periodo', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    await confirmReceipt(env.store, ctx(env, w.beto), (await toDelivered(env, w)).id);
    const view = await getProvenance(env.store, w.beto, BIRD_ID);
    assert.deepEqual(view.owners.map(o => o.alias), ['Ana', 'Beto']);
    assert.ok(view.owners[0].to); assert.equal(view.owners[1].to, null); assert.equal(view.owners[1].mine, true);
    assert.equal(view.passport?.originRing, 7);
    assert.equal((view.passport?.lineage.mother as { name: string }).name, 'Reina');
    assert.equal((await getProvenance(env.store, w.ana, BIRD_ID)).owners.length, 2); // el vendedor anterior también la ve
    const intruder = await env.addUser('Carla');
    await assert.rejects(getProvenance(env.store, intruder, BIRD_ID), status(403));
    assert.equal(JSON.stringify(view).includes('correo.test'), false);
  } finally { await env.cleanup(); }
});

test('anillo ocupado en la granja del comprador: no se pisa, queda pendiente y el original se conserva', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env, { buyerRing: 7 });
    await confirmReceipt(env.store, ctx(env, w.beto), (await toDelivered(env, w)).id);
    const buyer = await env.farm(w.beto);
    const rings = buyer.rings as { number: number; birdId: string }[];
    assert.equal(rings.filter(ring => ring.number === 7).length, 1);
    assert.equal(rings.find(ring => ring.number === 7)?.birdId, 'beto-propia');
    const moved = (buyer.birds as { id: string; notes: string }[]).find(item => item.id === BIRD_ID)!;
    assert.match(moved.notes, /pendiente de reasignar/);
    assert.equal((await getProvenance(env.store, w.beto, BIRD_ID)).passport?.originRing, 7);
  } finally { await env.cleanup(); }
});

test('roles y orden de pasos se validan en el servidor', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const carla = await env.addUser('Carla');
    const op = await requestPurchase(env.store, ctx(env, w.beto), w.listing.id);
    await assert.rejects(declarePayment(env.store, ctx(env, w.beto), op.id, 'x'), status(400));
    await assert.rejects(declarePayment(env.store, ctx(env, w.beto), op.id, 'Efectivo'), status(409)); // aún no aceptada
    await respondPurchase(env.store, ctx(env, w.ana), op.id, 'accept');
    await assert.rejects(declarePayment(env.store, ctx(env, w.ana), op.id, 'Efectivo'), status(403));
    await assert.rejects(declarePayment(env.store, ctx(env, carla), op.id, 'Efectivo'), status(403));
    await assert.rejects(confirmPayment(env.store, ctx(env, w.beto), op.id), status(403));
    await assert.rejects(markDelivered(env.store, ctx(env, w.ana), op.id), status(409));      // sin pago confirmado
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.beto), op.id), status(409));    // sin entrega
    await declarePayment(env.store, ctx(env, w.beto), op.id, 'Efectivo');
    await assert.rejects(declarePayment(env.store, ctx(env, w.beto), op.id, 'Efectivo'), status(409));
    await confirmPayment(env.store, ctx(env, w.ana), op.id);
    await assert.rejects(markDelivered(env.store, ctx(env, w.beto), op.id), status(403));
    await markDelivered(env.store, ctx(env, w.ana), op.id);
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.ana), op.id), status(403));
    await assert.rejects(cancelOperation(env.store, ctx(env, w.ana), op.id, 'Quiero cancelar ahora'), status(409)); // ya entregada: disputa, no cancelación
    await confirmReceipt(env.store, ctx(env, w.beto), op.id);
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.beto), op.id), status(409));
    await assert.rejects(getReceipt(env.store, carla, (await listOperations(env.store, w.beto))[0].receiptCode!), status(403));
  } finally { await env.cleanup(); }
});

test('si el vendedor ya no es el propietario, la transferencia se bloquea y no cambia nada', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const op = await toDelivered(env, w);
    await env.store.tx(async tx => { const row = (await tx.ownership.get(BIRD_ID))!; await tx.ownership.update({ ...row, ownerId: 'otro-propietario' }); });
    const beforeSeller = JSON.stringify(await env.farm(w.ana)), beforeBuyer = JSON.stringify(await env.farm(w.beto));
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.beto), op.id), (error: { status?: number; message?: string }) => error.status === 409 && /propietario actual/.test(error.message ?? ''));
    assert.equal(JSON.stringify(await env.farm(w.ana)), beforeSeller);
    assert.equal(JSON.stringify(await env.farm(w.beto)), beforeBuyer);
    assert.equal((await env.store.tx(tx => tx.operations.get(op.id)))?.status, 'entrega_confirmada');
    assert.equal((await env.store.tx(tx => tx.receipts.list())).length, 0);
  } finally { await env.cleanup(); }
});

test('un fallo a mitad de la transferencia revierte todo (atómica)', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const op = await toDelivered(env, w);
    await env.store.tx(tx => tx.farms.remove(w.beto)); // la granja del comprador desaparece
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.beto), op.id));
    assert.equal((await env.store.tx(tx => tx.ownership.get(BIRD_ID)))?.ownerId, w.ana);
    assert.equal(((await env.farm(w.ana)).birds as { id: string; status: string }[]).find(item => item.id === BIRD_ID)?.status, 'Activo');
    assert.equal((await env.store.tx(tx => tx.listings.get(w.listing.id)))?.status, 'en_operacion');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: BIRD_ID, status: 'active' }))).length, 1);
  } finally { await env.cleanup(); }
});

test('cancelar una compra directa libera la reserva, conserva historial y auditoría y permite otra venta', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const carla = await env.addUser('Carla');
    const op = await requestPurchase(env.store, ctx(env, w.beto), w.listing.id);
    await respondPurchase(env.store, ctx(env, w.ana), op.id, 'accept');
    await assert.rejects(cancelOperation(env.store, ctx(env, w.beto), op.id, 'corto'), status(400));
    await assert.rejects(cancelOperation(env.store, ctx(env, carla), op.id, 'No soy parte de esto'), status(403));
    const cancelled = await cancelOperation(env.store, ctx(env, w.beto), op.id, 'Ya no puedo recibirla');
    assert.equal(cancelled.status, 'cancelada');
    assert.equal(cancelled.history.at(-1)?.status, 'cancelada');
    assert.equal((await env.store.tx(tx => tx.listings.get(w.listing.id)))?.status, 'publicada');
    const lock = (await env.store.tx(tx => tx.locks.list({ birdId: BIRD_ID, status: 'active' })))[0];
    assert.equal(lock.operationId, undefined); assert.equal(lock.listingId, w.listing.id);
    assert.ok((await env.store.tx(tx => tx.audit.list({ targetId: op.id }))).some(row => row.action === 'operation.cancel'));
    const [note] = await notes(env, w.ana, 'market.operation.cancelled');
    assert.equal(note.critical, true); assert.match(note.body, /Ya no puedo recibirla/);
    assert.equal((await notes(env, w.beto, 'market.operation.cancelled')).length, 0);
    // otra persona puede comprar y completar
    const other = await requestPurchase(env.store, ctx(env, carla), w.listing.id);
    assert.equal((await respondPurchase(env.store, ctx(env, w.ana), other.id, 'accept')).status, 'pago_pendiente');
  } finally { await env.cleanup(); }
});

test('cancelar una operación nacida de subasta libera el ave para publicarla de nuevo', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    await env.saveFarm(ana, { birds: [bird({ id: 'luna', name: 'Luna' })] });
    const listing = await publishAuction(env, ana);
    await placeBid(env.store, ctx(env, beto), listing.id, 50_000, 'clave-subasta-1');
    await closeDueAuctions(env.store, at(env, 49 * HOUR));
    const op = (await env.store.tx(tx => tx.operations.list({ listingId: listing.id })))[0];
    await cancelOperation(env.store, ctx(env, ana, at(env, 50 * HOUR)), op.id, 'El comprador no respondió');
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'cerrada_sin_ofertas');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 0);
    await publishAuction(env, ana);
    assert.equal((await myListings(env.store, ana, 'publicada')).length, 1);
  } finally { await env.cleanup(); }
});

test('una subasta ganada recorre el mismo flujo hasta la transferencia', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    await env.saveFarm(ana, { birds: [bird({ id: 'luna', name: 'Luna', code: 'AVE-0003' })] });
    await env.saveFarm(beto, { birds: [] });
    const listing = await publishAuction(env, ana);
    await placeBid(env.store, ctx(env, beto), listing.id, 55_000, 'clave-subasta-2');
    await closeDueAuctions(env.store, at(env, 49 * HOUR));
    const op = (await env.store.tx(tx => tx.operations.list({ listingId: listing.id })))[0];
    await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
    await confirmPayment(env.store, ctx(env, ana), op.id);
    await markDelivered(env.store, ctx(env, ana), op.id);
    const { receiptCode } = await confirmReceipt(env.store, ctx(env, beto), op.id);
    assert.equal((await getReceipt(env.store, beto, receiptCode)).price, 55_000);
    assert.deepEqual(await activeBirdHolders(env, 'luna'), [beto]);
  } finally { await env.cleanup(); }
});

test('disputa: la operación y el ave quedan reservadas y no se puede completar', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const mod = await env.addUser('Moderadora', { role: 'moderator' });
    const op = await toDelivered(env, w);
    await assert.rejects(openDispute(env.store, ctx(env, w.beto), op.id, 'corto'), status(400));
    assert.equal((await openDispute(env.store, ctx(env, w.beto), op.id, 'El ave llegó enferma')).status, 'disputada');
    await assert.rejects(confirmReceipt(env.store, ctx(env, w.beto), op.id), status(409));
    await assert.rejects(cancelOperation(env.store, ctx(env, w.ana), op.id, 'Cancelo por la disputa'), status(409));
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: BIRD_ID, status: 'active' }))).length, 1);
    const [sellerNote] = await notes(env, w.ana, 'market.operation.disputed');
    assert.equal(sellerNote.priority, 'critica'); assert.match(sellerNote.body, /llegó enferma/);
    assert.match((await notes(env, mod, 'market.operation.disputed'))[0].title, /por revisar/);
    assert.equal((await notes(env, w.beto, 'market.operation.disputed')).length, 0);
  } finally { await env.cleanup(); }
});

test('el contacto solo se revela cuando ambas partes lo autorizan y la operación está en curso', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    const op = await requestPurchase(env.store, ctx(env, w.beto), w.listing.id);
    await assert.rejects(shareContact(env.store, ctx(env, w.beto), op.id), status(409));
    await respondPurchase(env.store, ctx(env, w.ana), op.id, 'accept');
    await assert.rejects(getContact(env.store, w.ana, op.id), status(403));
    await shareContact(env.store, ctx(env, w.beto), op.id);
    await assert.rejects(getContact(env.store, w.ana, op.id), status(403)); // falta el consentimiento del vendedor
    await assert.rejects(getContact(env.store, w.beto, op.id), status(403));
    await shareContact(env.store, ctx(env, w.ana), op.id);
    const forSeller = await getContact(env.store, w.ana, op.id);
    assert.equal(forSeller.phone, '300 111 2222'); assert.match(forSeller.email, /beto@/);
    const forBuyer = await getContact(env.store, w.beto, op.id);
    assert.match(forBuyer.email, /ana@/);
    await assert.rejects(getContact(env.store, await env.addUser('Carla'), op.id), status(403));
  } finally { await env.cleanup(); }
});

test('el comprobante detecta alteraciones de su contenido', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    await confirmReceipt(env.store, ctx(env, w.beto), (await toDelivered(env, w)).id);
    const stored = (await env.store.tx(tx => tx.receipts.list()))[0];
    assert.equal(verifyReceipt(stored), true);
    assert.equal(verifyReceipt({ ...stored, price: 1 }), false);
    assert.equal(verifyReceipt({ ...stored, buyerAlias: 'Otro' }), false);
    assert.equal(receiptHash({ code: 'X', birdId: 'a', birdCode: '', birdName: '', ring: null, sellerAlias: '', buyerAlias: '', price: 0, transferredAt: '', operationId: '' }).length, 64);
  } finally { await env.cleanup(); }
});

test('tras transferir, ambas partes pueden seguir guardando su granja; la lápida no se altera', async () => {
  const env = await makeEnv();
  try {
    const w = await world(env);
    await confirmReceipt(env.store, ctx(env, w.beto), (await toDelivered(env, w)).id);
    const seller = await env.farm(w.ana), buyer = await env.farm(w.beto);
    await env.saveFarm(w.ana, { birds: seller.birds, notes: 'otro cambio' });
    await env.saveFarm(w.beto, { birds: (buyer.birds as Record<string, unknown>[]).map(item => item.id === BIRD_ID ? { ...item, coopId: 'c9', name: 'Luna ahora mía' } : item) });
    await assert.rejects(env.saveFarm(w.ana, { birds: (seller.birds as Record<string, unknown>[]).map(item => item.id === BIRD_ID ? { ...item, status: 'Activo' } : item) }), status(409));
    // el vendedor no puede volver a publicar el ave que ya no es suya
    await assert.rejects(createListing(deps(env), ctx(env, w.ana), { birdId: BIRD_ID, kind: 'fixed', price: 1000 }), status(403));
  } finally { await env.cleanup(); }
});
