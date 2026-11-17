import assert from 'node:assert/strict';
import test from 'node:test';
import { bidHistory, cancelAuction, closeDueAuctions, myBids, notifyClosingSoon, placeBid } from '../src/features/market/service/auction.ts';
import { defaultMinIncrement, topBid } from '../src/features/market/service/auction-rules.ts';
import { createListing, getListingForViewer, myListings, pauseListing, refreshSnapshot, updateListing, withdrawListing, browseListings } from '../src/features/market/service/listings.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { HOUR, MIN, at, ctx, deps, notes, publishAuction, sellerWithBird, status } from './helpers/market.ts';

async function setup(env: TestEnv, overrides = {}) {
  const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
  const listing = await publishAuction(env, ana, overrides);
  return { ana, beto, carla, listing };
}
const bid = (env: TestEnv, userId: string, listingId: string, amount: number, key = `key-${userId.slice(0, 4)}-${amount}`, now?: Date) => placeBid(env.store, ctx(env, userId, now), listingId, amount, key);

test('el incremento por defecto es el mayor entre 1.000 COP y el 5 % del precio inicial', () => {
  assert.equal(defaultMinIncrement(10_000), 1000);
  assert.equal(defaultMinIncrement(50_000), 2500);
  assert.equal(defaultMinIncrement(1_000_000), 50_000);
});

test('la subasta se crea con reglas explícitas y valida precio, reserva y duración', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    const listing = await publishAuction(env, ana, { reservePrice: 80000 });
    assert.equal(listing.auction?.startingPrice, 50000);
    assert.equal(listing.auction?.minIncrement, 2500);
    assert.equal(listing.auction?.reservePrice, 80000);
    assert.equal(listing.status, 'publicada');
    const create = (auction: Record<string, unknown>) => createListing(deps(env), ctx(env, ana), { birdId: 'otra', kind: 'auction', auction: { startingPrice: 50000, closesAt: at(env, 48 * HOUR).toISOString(), ...auction } as never });
    await assert.rejects(create({ startingPrice: 10 }), status(400));
    await assert.rejects(create({ reservePrice: 10000 }), status(400));
    await assert.rejects(create({ closesAt: at(env, 30 * MIN).toISOString() }), status(400));
    await assert.rejects(create({ closesAt: at(env, 40 * 24 * HOUR).toISOString() }), status(400));
    await assert.rejects(create({ closesAt: 'mañana' }), status(400));
    await assert.rejects(createListing(deps(env), ctx(env, ana), { birdId: 'otra', kind: 'auction' }), status(400));
  } finally { await env.cleanup(); }
});

test('las ofertas cumplen las reglas: mínimo, incremento, vendedor y oferta propia más alta', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, carla, listing } = await setup(env);
    await assert.rejects(bid(env, beto, listing.id, 49_999), status(400));
    await bid(env, beto, listing.id, 50_000);
    await assert.rejects(bid(env, carla, listing.id, 51_000), (error: { status?: number; message?: string }) => error.status === 400 && /52\.500/.test(error.message ?? ''));
    await assert.rejects(bid(env, ana, listing.id, 60_000), status(403));
    await assert.rejects(bid(env, beto, listing.id, 70_000, 'otra-clave-1'), status(409));
    await bid(env, carla, listing.id, 52_500);
    await assert.rejects(placeBid(env.store, ctx(env, beto), listing.id, 'mucho', 'clave-invalida-1'), status(400));
    await assert.rejects(placeBid(env.store, ctx(env, beto), listing.id, 60_000, 'x'), status(400));
    const view = await getListingForViewer(env.store, listing.id, beto, env.now);
    assert.equal(view.listing.auction?.currentPrice, 52_500);
    assert.equal(view.listing.auction?.minNextBid, 55_000);
    assert.equal(view.listing.auction?.bidCount, 2);
  } finally { await env.cleanup(); }
});

test('una oferta repetida con la misma clave no se duplica', async () => {
  const env = await makeEnv();
  try {
    const { beto, listing } = await setup(env);
    const first = await bid(env, beto, listing.id, 50_000, 'clave-unica-1');
    const second = await bid(env, beto, listing.id, 50_000, 'clave-unica-1');
    assert.equal(first.id, second.id);
    assert.equal((await env.store.tx(tx => tx.bids.list({ listingId: listing.id }))).length, 1);
  } finally { await env.cleanup(); }
});

test('dos ofertas simultáneas por el mismo importe: solo una gana', async () => {
  const env = await makeEnv();
  try {
    const { beto, carla, listing } = await setup(env);
    const results = await Promise.allSettled([bid(env, beto, listing.id, 60_000), bid(env, carla, listing.id, 60_000)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await env.store.tx(tx => tx.bids.list({ listingId: listing.id, status: 'valida' }))).length, 1);
  } finally { await env.cleanup(); }
});

test('no se aceptan ofertas antes de abrir ni después del cierre', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const scheduled = await publishAuction(env, ana, { opensAt: at(env, 2 * HOUR).toISOString(), closesAt: at(env, 72 * HOUR).toISOString() });
    await assert.rejects(bid(env, beto, scheduled.id, 50_000), (error: { status?: number; message?: string }) => error.status === 409 && /no ha abierto/.test(error.message ?? ''));
    await bid(env, beto, scheduled.id, 50_000, 'clave-abierta-1', at(env, 3 * HOUR));
    await assert.rejects(bid(env, beto, scheduled.id, 99_000, 'clave-tarde-1', at(env, 73 * HOUR)), (error: { status?: number; message?: string }) => error.status === 409 && /cerró/.test(error.message ?? ''));
    await assert.rejects(bid(env, beto, scheduled.id, 99_000, 'clave-justo-1', at(env, 72 * HOUR)), status(409));
  } finally { await env.cleanup(); }
});

test('al cerrar gana la oferta más alta: crea la operación, reserva el ave y notifica a los usuarios correctos', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, carla, listing } = await setup(env);
    const dora = await env.addUser('Dora');
    await bid(env, beto, listing.id, 50_000);
    await bid(env, carla, listing.id, 55_000);
    await bid(env, beto, listing.id, 60_000);
    const after = at(env, 49 * HOUR);
    assert.deepEqual(await closeDueAuctions(env.store, after), { closed: 1 });
    const closed = await env.store.tx(tx => tx.listings.get(listing.id));
    assert.equal(closed?.status, 'en_operacion');
    const ops = await env.store.tx(tx => tx.operations.list({ listingId: listing.id }));
    assert.equal(ops.length, 1);
    assert.equal(ops[0].buyerId, beto); assert.equal(ops[0].price, 60_000); assert.equal(ops[0].status, 'pago_pendiente'); assert.equal(ops[0].origin, 'subasta'); assert.deepEqual(ops[0].history.map(h => h.status), ['aceptada', 'pago_pendiente']);
    const lock = (await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' })))[0];
    assert.equal(lock.operationId, ops[0].id);
    const bids = await env.store.tx(tx => tx.bids.list({ listingId: listing.id }));
    assert.equal(bids.filter(b => b.status === 'ganadora').length, 1);
    assert.equal(bids.find(b => b.status === 'ganadora')?.bidderId, beto);
    const audit = (await env.store.tx(tx => tx.audit.list({ targetId: listing.id }))).find(row => row.action === 'auction.close');
    assert.equal((audit?.detail as { outcome: string }).outcome, 'adjudicada');
    // notificaciones
    assert.equal((await notes(env, beto, 'market.auction.won')).length, 1);
    assert.equal((await notes(env, beto, 'market.auction.won'))[0].critical, true);
    assert.equal((await notes(env, ana, 'market.auction.ended')).length, 1);
    assert.equal((await notes(env, carla, 'market.auction.lost')).length, 1);
    assert.equal((await notes(env, beto, 'market.auction.lost')).length, 0);
    assert.equal((await notes(env, dora)).length, 0);
    assert.equal((await notes(env, ana, 'market.bid.received')).length, 3);
    assert.equal((await notes(env, carla, 'market.bid.outbid')).length, 1);
    assert.equal((await notes(env, beto, 'market.bid.outbid')).length, 1);
    // idempotente
    assert.deepEqual(await closeDueAuctions(env.store, after), { closed: 0 });
    assert.equal((await env.store.tx(tx => tx.operations.list({ listingId: listing.id }))).length, 1);
    assert.equal((await notes(env, beto, 'market.auction.won')).length, 1);
    // una subasta finalizada no acepta ofertas nuevas
    await assert.rejects(bid(env, carla, listing.id, 99_000, 'clave-final-1', after), status(409));
  } finally { await env.cleanup(); }
});

test('sin ofertas la subasta termina sin comprador, libera el ave y se puede volver a publicar', async () => {
  const env = await makeEnv();
  try {
    const { ana, listing } = await setup(env);
    await closeDueAuctions(env.store, at(env, 49 * HOUR));
    const closed = await env.store.tx(tx => tx.listings.get(listing.id));
    assert.equal(closed?.status, 'cerrada_sin_ofertas'); assert.equal(closed?.closedReason, 'sin_ofertas');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 0);
    assert.equal((await env.store.tx(tx => tx.operations.list())).length, 0);
    const [note] = await notes(env, ana, 'market.auction.ended');
    assert.match(note.title, /sin comprador/);
    const again = await publishAuction(env, ana);
    assert.equal(again.status, 'publicada');
  } finally { await env.cleanup(); }
});

test('si no se alcanza la reserva no hay comprador y se informa sin cobros', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, listing } = await setup(env, { reservePrice: 90_000 });
    await bid(env, beto, listing.id, 70_000);
    await closeDueAuctions(env.store, at(env, 49 * HOUR));
    const closed = await env.store.tx(tx => tx.listings.get(listing.id));
    assert.equal(closed?.status, 'cerrada_sin_ofertas'); assert.equal(closed?.closedReason, 'reserva_no_alcanzada');
    assert.equal((await env.store.tx(tx => tx.operations.list())).length, 0);
    assert.match((await notes(env, ana, 'market.auction.ended'))[0].body, /reserva/);
    assert.match((await notes(env, beto, 'market.auction.lost'))[0].body, /reserva/);
    assert.equal((await env.store.tx(tx => tx.bids.list({ listingId: listing.id })))[0].status, 'no_ganadora');
  } finally { await env.cleanup(); }
});

test('el empate se resuelve a favor de la oferta más temprana', () => {
  const mk = (id: string, amount: number, seq: number) => ({ id, listingId: 'l', bidderId: id, amount, seq, idempotencyKey: id, status: 'valida' as const, placedAt: '2026-10-14T12:00:00.000Z' });
  assert.equal(topBid([mk('tarde', 100, 3), mk('temprano', 100, 2), mk('menos', 90, 1)])?.id, 'temprano');
});

test('el historial público usa alias estables y no expone identidades', async () => {
  const env = await makeEnv();
  try {
    const { beto, carla, listing } = await setup(env);
    await bid(env, beto, listing.id, 50_000);
    await bid(env, carla, listing.id, 55_000);
    await bid(env, beto, listing.id, 60_000);
    const history = await bidHistory(env.store, listing.id, beto);
    assert.deepEqual(history.map(row => [row.alias, row.amount, row.mine]), [['Postor 1', 60_000, true], ['Postor 2', 55_000, false], ['Postor 1', 50_000, true]]);
    const raw = JSON.stringify(history);
    for (const secret of [beto, carla, 'correo.test', 'Beto', 'Carla']) assert.equal(raw.includes(secret), false);
    const detail = JSON.stringify(await getListingForViewer(env.store, listing.id, carla, env.now));
    for (const secret of ['correo.test', beto, 'reservePrice']) assert.equal(detail.includes(secret), false);
  } finally { await env.cleanup(); }
});

test('anti-sniping: una oferta en los últimos minutos extiende el cierre (con tope)', async () => {
  const env = await makeEnv();
  try {
    const { beto, carla, listing } = await setup(env, { antiSniping: true });
    const closes = new Date(listing.closesAt!);
    await bid(env, beto, listing.id, 50_000, 'clave-sniping-1', new Date(closes.getTime() - 2 * MIN));
    const after = await env.store.tx(tx => tx.listings.get(listing.id));
    assert.equal(new Date(after!.closesAt!).getTime(), closes.getTime() + 5 * MIN);
    assert.equal(after?.extensions, 1);
    await bid(env, carla, listing.id, 60_000, 'clave-sniping-2', new Date(closes.getTime() - 10 * MIN));
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.extensions, 1); // fuera de ventana: sin extensión
  } finally { await env.cleanup(); }
});

test('cancelar: libre sin ofertas; con ofertas solo con más de 24 h, con motivo y avisando a los postores', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const free = await publishAuction(env, ana);
    const cancelledFree = await cancelAuction(env.store, ctx(env, ana), free.id, '');
    assert.equal(cancelledFree.status, 'cancelada');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 0);

    const withBids = await publishAuction(env, ana);
    await bid(env, beto, withBids.id, 50_000);
    await assert.rejects(cancelAuction(env.store, ctx(env, ana), withBids.id, 'corto'), status(400));
    await assert.rejects(cancelAuction(env.store, ctx(env, beto), withBids.id, 'No me corresponde cancelar'), status(403));
    await assert.rejects(cancelAuction(env.store, ctx(env, ana, at(env, 30 * HOUR)), withBids.id, 'Cambio de planes con el ave'), (error: { status?: number; message?: string }) => error.status === 409 && /24 horas/.test(error.message ?? ''));
    await cancelAuction(env.store, ctx(env, ana), withBids.id, 'Cambio de planes con el ave');
    const note = (await notes(env, beto, 'market.auction.cancelled'))[0];
    assert.equal(note.critical, true); assert.match(note.body, /Cambio de planes/);
    const log = await env.store.tx(tx => tx.audit.list({ targetId: withBids.id }));
    assert.ok(log.some(row => row.action === 'auction.cancel' && (row.detail as { reason: string }).reason.includes('Cambio de planes')));
    assert.equal((await env.store.tx(tx => tx.bids.list({ listingId: withBids.id }))).every(b => b.status === 'no_ganadora'), true);
  } finally { await env.cleanup(); }
});

test('una subasta con ofertas no se pausa, retira, edita ni actualiza en silencio', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, listing } = await setup(env);
    await updateListing(deps(env), ctx(env, ana), listing.id, { terms: 'Entrega en finca' });
    await assert.rejects(updateListing(deps(env), ctx(env, ana), listing.id, { price: 1000 }), status(400));
    await bid(env, beto, listing.id, 50_000);
    await assert.rejects(pauseListing(deps(env), ctx(env, ana), listing.id), status(409));
    await assert.rejects(withdrawListing(deps(env), ctx(env, ana), listing.id), (error: { status?: number; message?: string }) => error.status === 409 && /Cancelar subasta/.test(error.message ?? ''));
    await assert.rejects(updateListing(deps(env), ctx(env, ana), listing.id, { terms: 'otras' }), status(409));
    await assert.rejects(refreshSnapshot(deps(env), ctx(env, ana), listing.id), status(409));
  } finally { await env.cleanup(); }
});

test('aviso de cierre próximo: una vez por fecha de cierre, a vendedor y postores', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, carla, listing } = await setup(env);
    await bid(env, beto, listing.id, 50_000);
    const near = at(env, 47 * HOUR + 30 * MIN);
    assert.deepEqual(await notifyClosingSoon(env.store, at(env, 10 * HOUR)), { notified: 0 });
    assert.deepEqual(await notifyClosingSoon(env.store, near), { notified: 1 });
    assert.deepEqual(await notifyClosingSoon(env.store, near), { notified: 0 });
    assert.equal((await notes(env, ana, 'market.auction.closing_soon')).length, 1);
    assert.equal((await notes(env, beto, 'market.auction.closing_soon')).length, 1);
    assert.equal((await notes(env, carla, 'market.auction.closing_soon')).length, 0);
    assert.match((await notes(env, beto, 'market.auction.closing_soon'))[0].body, /octubre/);
  } finally { await env.cleanup(); }
});

test('Mis ofertas refleja si voy liderando, fui superado o gané', async () => {
  const env = await makeEnv();
  try {
    const { beto, carla, listing } = await setup(env);
    await bid(env, beto, listing.id, 50_000);
    assert.equal((await myBids(env.store, beto, env.now))[0].result, 'liderando');
    await bid(env, carla, listing.id, 55_000);
    assert.equal((await myBids(env.store, beto, env.now))[0].result, 'superada');
    await closeDueAuctions(env.store, at(env, 49 * HOUR));
    assert.equal((await myBids(env.store, carla, at(env, 49 * HOUR)))[0].result, 'ganadora');
    assert.equal((await myBids(env.store, beto, at(env, 49 * HOUR)))[0].result, 'no_ganadora');
  } finally { await env.cleanup(); }
});

test('el catálogo muestra el precio actual de las subastas sin revelar la reserva', async () => {
  const env = await makeEnv();
  try {
    const { beto, listing } = await setup(env, { reservePrice: 99_000 });
    await bid(env, beto, listing.id, 50_000);
    const result = await browseListings(env.store, {}, env.now);
    assert.equal(result.items[0].auction?.currentPrice, 50_000);
    assert.equal(result.items[0].auction?.hasReserve, true);
    assert.equal(JSON.stringify(result).includes('99000'), false);
    assert.equal((await myListings(env.store, (await env.store.tx(tx => tx.listings.get(listing.id)))!.sellerId, undefined, env.now))[0].auction?.bidCount, 1);
  } finally { await env.cleanup(); }
});
