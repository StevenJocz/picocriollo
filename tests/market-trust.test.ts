import assert from 'node:assert/strict';
import test from 'node:test';
import { placeBid } from '../src/features/market/service/auction.ts';
import { commercialInsights } from '../src/features/market/service/insights.ts';
import { addInterest, browseListings, createListing, getListingForViewer, updateListing } from '../src/features/market/service/listings.ts';
import { createReport, listDisputes, listReports, moderateListing, resolveDispute, resolveReport } from '../src/features/market/service/moderation.ts';
import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, listOperations, markDelivered, openDispute, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { sendMessage } from '../src/features/market/service/messages.ts';
import { PAIR_CAP, RATING_WINDOW_MS, publicProfile, rateOperation, reputationFrom } from '../src/features/market/service/trust.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { HOUR, at, ctx, deps, notes, publishAuction, publishFixed, sellerWithBird, status } from './helpers/market.ts';

async function completeSale(env: TestEnv, seller: string, buyer: string, birdId = 'luna', price = 85000) {
  const listing = await publishFixed(env, seller, price, birdId);
  const op = await requestPurchase(env.store, ctx(env, buyer), listing.id);
  await respondPurchase(env.store, ctx(env, seller), op.id, 'accept');
  await declarePayment(env.store, ctx(env, buyer), op.id, 'Efectivo');
  await confirmPayment(env.store, ctx(env, seller), op.id);
  await markDelivered(env.store, ctx(env, seller), op.id);
  await confirmReceipt(env.store, ctx(env, buyer), op.id);
  return { listing, op };
}
async function staff(env: TestEnv, role: 'moderator' | 'admin' = 'moderator', name = 'Moderadora') { return env.addUser(name, { role }); }

// ---------------- Reputación ----------------

test('solo se valoran operaciones completadas, una vez por parte, con 1 a 5 estrellas y dentro de 14 días', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await assert.rejects(rateOperation(env.store, ctx(env, beto), op.id, { stars: 5 }), status(409)); // aún no completada
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo'); await confirmPayment(env.store, ctx(env, ana), op.id); await markDelivered(env.store, ctx(env, ana), op.id); await confirmReceipt(env.store, ctx(env, beto), op.id);
    await assert.rejects(rateOperation(env.store, ctx(env, carla), op.id, { stars: 5 }), status(403));
    for (const stars of [0, 6, 2.5, 'x', undefined]) await assert.rejects(rateOperation(env.store, ctx(env, beto), op.id, { stars }), status(400));
    await assert.rejects(rateOperation(env.store, ctx(env, beto), op.id, { stars: 5, comment: 'llámame al 300 123 4567' }), status(400));
    await assert.rejects(rateOperation(env.store, ctx(env, beto), op.id, { stars: 5, comment: 'x'.repeat(501) }), status(400));
    const rating = await rateOperation(env.store, ctx(env, beto), op.id, { stars: 5, comment: 'Todo en orden' });
    assert.equal(rating.rateeId, ana);
    await assert.rejects(rateOperation(env.store, ctx(env, beto), op.id, { stars: 1 }), (error: { status?: number; message?: string }) => error.status === 409 && /Ya valoraste/.test(error.message ?? ''));
    await rateOperation(env.store, ctx(env, ana), op.id, { stars: 4 });
    assert.equal((await env.store.tx(tx => tx.ratings.list({ operationId: op.id }))).length, 2);
  } finally { await env.cleanup(); }
});

test('el plazo de valoración vence a los 14 días', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const { op } = await completeSale(env, ana, beto);
    await assert.rejects(rateOperation(env.store, ctx(env, beto, new Date(env.now.getTime() + RATING_WINDOW_MS + 1000)), op.id, { stars: 5 }), (error: { status?: number; message?: string }) => error.status === 409 && /14 días/.test(error.message ?? ''));
    await rateOperation(env.store, ctx(env, beto, new Date(env.now.getTime() + RATING_WINDOW_MS - 1000)), op.id, { stars: 5 });
  } finally { await env.cleanup(); }
});

test('el valorado recibe aviso y la reputación se muestra en el mercado', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const { op } = await completeSale(env, ana, beto);
    assert.equal((await notes(env, ana, 'market.rating.received')).length, 0);
    await rateOperation(env.store, ctx(env, beto), op.id, { stars: 4 });
    const [note] = await notes(env, ana, 'market.rating.received');
    assert.match(note.body, /Beto/); assert.match(note.body, /4 de 5/);
    assert.equal((await notes(env, beto, 'market.rating.received')).length, 0);
    const profile = await publicProfile(env.store, ana);
    assert.deepEqual(profile.reputation, { count: 1, average: 4, completed: 1, distribution: [0, 0, 0, 1, 0] });
    await env.saveFarm(ana, { birds: [...((await env.farm(ana)).birds as Record<string, unknown>[]), bird({ id: 'nueva', name: 'Nueva' })] });
    await publishFixed(env, ana, 50000, 'nueva');
    const listed = (await browseListings(env.store, {})).items[0];
    assert.equal(listed.sellerReputation?.average, 4);
    assert.equal(JSON.stringify(listed).includes(beto), false);
  } finally { await env.cleanup(); }
});

test('la valoración de la otra parte se oculta hasta que valoras o vence el plazo (sin represalias)', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const { op } = await completeSale(env, ana, beto);
    await rateOperation(env.store, ctx(env, beto), op.id, { stars: 2, comment: 'Tardó' });
    const before = (await listOperations(env.store, ana, 'vendedor', env.now))[0].rating!;
    assert.equal(before.canRate, true); assert.equal(before.theirs, undefined);
    await rateOperation(env.store, ctx(env, ana), op.id, { stars: 5 });
    const after = (await listOperations(env.store, ana, 'vendedor', env.now))[0].rating!;
    assert.equal(after.canRate, false); assert.equal(after.theirs?.stars, 2);
  } finally { await env.cleanup(); }
});

test('el promedio limita cuántas valoraciones de una misma persona cuentan (anti-manipulación)', () => {
  const mk = (rater: string, stars: number, n: number) => ({ raterId: rater, rateeId: 'v', stars, createdAt: `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00.000Z` });
  const friend = [1, 2, 3, 4, 5].map(n => mk('amigo', 5, n));
  const result = reputationFrom([...friend, mk('otro', 1, 6)], 6);
  assert.equal(PAIR_CAP, 3);
  assert.equal(result.count, 4); // 3 del amigo + 1 del otro
  assert.equal(result.average, 4); // (5+5+5+1)/4
  assert.deepEqual(reputationFrom([], 0), { count: 0, average: 0, completed: 0, distribution: [0, 0, 0, 0, 0] });
});

// ---------------- Denuncias y moderación ----------------

test('denunciar: una abierta por persona, no la propia, y los moderadores reciben el aviso', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env);
    const listing = await publishFixed(env, ana);
    await assert.rejects(createReport(env.store, ctx(env, ana), { targetType: 'listing', targetId: listing.id, reason: 'Es mía y la denuncio' }), status(403));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: listing.id, reason: 'corto' }), status(400));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'cosa', targetId: listing.id, reason: 'Motivo suficientemente largo' }), status(400));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: 'nada', reason: 'Motivo suficientemente largo' }), status(404));
    await createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: listing.id, reason: 'La foto no corresponde al ave real' });
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: listing.id, reason: 'La foto no corresponde al ave real' }), status(409));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'user', targetId: beto, reason: 'Me denuncio a mí mismo' }), status(403));
    assert.equal((await notes(env, mod, 'moderation.report.created')).length, 1);
    assert.equal((await notes(env, ana, 'moderation.report.created')).length, 0);
    assert.equal((await notes(env, beto, 'moderation.report.created')).length, 0);
  } finally { await env.cleanup(); }
});

test('solo moderadores ven y resuelven denuncias (el rol se valida en el servidor)', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env);
    const listing = await publishFixed(env, ana);
    const report = await createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: listing.id, reason: 'Publicación engañosa sobre la raza' });
    await assert.rejects(listReports(env.store, beto), status(403));
    await assert.rejects(listReports(env.store, ana), status(403));
    await assert.rejects(resolveReport(env.store, ctx(env, beto), report.id, { action: 'dismiss', note: 'me autoapruebo' }), status(403));
    await assert.rejects(moderateListing(env.store, ctx(env, ana), listing.id, 'restore', 'intento de moderarme'), status(403));
    const views = await listReports(env.store, mod);
    assert.equal(views.length, 1); assert.equal(views[0].reporter, 'Beto'); assert.match(views[0].target, /Luna/);
    assert.equal(JSON.stringify(views).includes('correo.test'), false);
  } finally { await env.cleanup(); }
});

test('rechazar una publicación libera el ave, avisa al vendedor (crítico) y queda auditado', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env);
    const listing = await publishFixed(env, ana);
    const report = await createReport(env.store, ctx(env, beto), { targetType: 'listing', targetId: listing.id, reason: 'Publicación engañosa sobre la raza' });
    await assert.rejects(resolveReport(env.store, ctx(env, mod), report.id, { action: 'hide', note: 'acción de otro tipo' }), status(400));
    await assert.rejects(resolveReport(env.store, ctx(env, mod), report.id, { action: 'reject', note: '' }), status(400));
    const resolved = await resolveReport(env.store, ctx(env, mod), report.id, { action: 'reject', note: 'La raza declarada no coincide con la foto' });
    assert.equal(resolved.status, 'resuelta');
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'rechazada');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' }))).length, 0);
    const [note] = await notes(env, ana, 'moderation.listing.rejected');
    assert.equal(note.critical, true); assert.match(note.body, /no coincide con la foto/);
    const log = await env.store.tx(tx => tx.audit.list({ actorId: mod }));
    assert.ok(log.some(row => row.action === 'moderation.listing.reject')); assert.ok(log.some(row => row.action === 'moderation.report.resolve'));
    await assert.rejects(moderateListing(env.store, ctx(env, mod), listing.id, 'restore', 'ya rechazada'), status(409));
    await publishFixed(env, ana); // el vendedor puede publicar de nuevo (corrigiendo)
  } finally { await env.cleanup(); }
});

test('pausar y reanudar por moderación; con subasta con ofertas, el retiro avisa a los postores', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env, 'admin', 'Admin');
    const fixed = await publishFixed(env, ana);
    await moderateListing(env.store, ctx(env, mod), fixed.id, 'pause', 'Revisión por reclamo');
    assert.equal((await env.store.tx(tx => tx.listings.get(fixed.id)))?.status, 'pausada');
    assert.equal((await notes(env, ana, 'moderation.listing.paused')).length, 1);
    await moderateListing(env.store, ctx(env, mod), fixed.id, 'restore', 'Todo en orden');
    assert.equal((await notes(env, ana, 'moderation.listing.restored')).length, 1);
    await moderateListing(env.store, ctx(env, mod), fixed.id, 'withdraw', 'Cambio de estado');
    const auction = await publishAuction(env, ana);
    await placeBid(env.store, ctx(env, beto), auction.id, 50_000, 'clave-mod-1');
    await moderateListing(env.store, ctx(env, mod), auction.id, 'withdraw', 'Reglas incumplidas');
    assert.equal((await env.store.tx(tx => tx.listings.get(auction.id)))?.status, 'retirada');
    assert.match((await notes(env, beto, 'market.auction.cancelled'))[0].body, /moderación/);
  } finally { await env.cleanup(); }
});

test('un moderador no puede moderar lo suyo ni resolver su propia denuncia', async () => {
  const env = await makeEnv();
  try {
    const mod = await staff(env), beto = await env.addUser('Beto'), other = await staff(env, 'moderator', 'Otro');
    await env.saveFarm(mod, { birds: [bird({ id: 'luna', name: 'Luna' })] });
    const listing = await publishFixed(env, mod);
    await assert.rejects(moderateListing(env.store, ctx(env, mod), listing.id, 'pause', 'Pausa propia'), status(403));
    const report = await createReport(env.store, ctx(env, other), { targetType: 'listing', targetId: listing.id, reason: 'Motivo suficientemente largo' });
    await assert.rejects(resolveReport(env.store, ctx(env, other), report.id, { action: 'dismiss', note: 'la hice yo' }), status(403));
    await assert.rejects(resolveReport(env.store, ctx(env, mod), report.id, { action: 'pause', note: 'sobre lo mío' }), status(403));
  } finally { await env.cleanup(); }
});

test('tres denuncias de cuentas distintas pausan una publicación sin ofertas', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), users = await Promise.all(['U1', 'U2', 'U3'].map(name => env.addUser(name)));
    const listing = await publishFixed(env, ana);
    await createReport(env.store, ctx(env, users[0]), { targetType: 'listing', targetId: listing.id, reason: 'Parece una estafa evidente' });
    await createReport(env.store, ctx(env, users[1]), { targetType: 'listing', targetId: listing.id, reason: 'Parece una estafa evidente' });
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'publicada');
    await createReport(env.store, ctx(env, users[2]), { targetType: 'listing', targetId: listing.id, reason: 'Parece una estafa evidente' });
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'pausada');
    assert.equal((await notes(env, ana, 'moderation.listing.paused')).length, 1);
    assert.ok((await env.store.tx(tx => tx.audit.list({ targetId: listing.id }))).some(row => row.action === 'moderation.auto_pause'));
    // una subasta con ofertas no se pausa sola
    const auction = await publishAuction(env, ana, {}, 'otra');
    await placeBid(env.store, ctx(env, users[0]), auction.id, 50_000, 'clave-auto-1');
    for (const user of users) await createReport(env.store, ctx(env, user), { targetType: 'listing', targetId: auction.id, reason: 'Parece una estafa evidente' });
    assert.equal((await env.store.tx(tx => tx.listings.get(auction.id)))?.status, 'publicada');
  } finally { await env.cleanup(); }
});

test('denunciar un mensaje: solo quien participa; el moderador lo oculta', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla'), mod = await staff(env);
    const listing = await publishFixed(env, ana);
    const sent = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Mensaje ofensivo de prueba' });
    await assert.rejects(createReport(env.store, ctx(env, carla), { targetType: 'message', targetId: sent.messageId, reason: 'Ni siquiera participo aquí' }), status(404));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'message', targetId: sent.messageId, reason: 'Es mi propio mensaje' }), status(403));
    const report = await createReport(env.store, ctx(env, ana), { targetType: 'message', targetId: sent.messageId, reason: 'Lenguaje abusivo hacia mí' });
    await resolveReport(env.store, ctx(env, mod), report.id, { action: 'hide', note: 'Lenguaje abusivo' });
    assert.equal((await env.store.tx(tx => tx.messages.get(sent.messageId)))?.hidden, true);
    const { getThread } = await import('../src/features/market/service/messages.ts');
    assert.equal((await getThread(env.store, ana, sent.threadId)).messages.length, 0);
  } finally { await env.cleanup(); }
});

test('suspender una cuenta bloquea publicar, ofertar, solicitar, escribir y mostrar interés; se puede levantar', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env);
    await env.saveFarm(beto, { birds: [bird({ id: 'de-beto', name: 'DeBeto' })] });
    const fixed = await publishFixed(env, ana), auction = await publishAuction(env, ana, {}, 'otra');
    const report = await createReport(env.store, ctx(env, ana), { targetType: 'user', targetId: beto, reason: 'Ofertas falsas repetidas' });
    await resolveReport(env.store, ctx(env, mod), report.id, { action: 'suspend', note: 'Ofertas falsas' });
    const forbidden = status(403);
    await assert.rejects(createListing(deps(env), ctx(env, beto), { birdId: 'de-beto', kind: 'fixed', price: 1000 }), forbidden);
    await assert.rejects(placeBid(env.store, ctx(env, beto), auction.id, 50_000, 'clave-susp-1'), forbidden);
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), fixed.id), forbidden);
    await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: fixed.id, body: 'hola' }), forbidden);
    await assert.rejects(addInterest(deps(env), ctx(env, beto), fixed.id, ''), forbidden);
    const [note] = await notes(env, beto, 'moderation.account.suspended');
    assert.equal(note.critical, true); assert.equal(note.priority, 'critica');
    const second = await createReport(env.store, ctx(env, ana), { targetType: 'user', targetId: beto, reason: 'Reviso la suspensión' });
    await resolveReport(env.store, ctx(env, mod), second.id, { action: 'unsuspend', note: 'Aclarado' });
    await requestPurchase(env.store, ctx(env, beto), fixed.id);
    assert.equal((await notes(env, beto, 'moderation.account.restored')).length, 1);
  } finally { await env.cleanup(); }
});

test('disputas: el moderador cancela (libera el ave) o reanuda donde estaba; las partes no la resuelven', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), mod = await staff(env);
    const listing = await publishFixed(env, ana);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
    await openDispute(env.store, ctx(env, ana), op.id, 'El comprador no respondió desde el pago');
    assert.equal((await listDisputes(env.store, mod)).length, 1);
    await assert.rejects(listDisputes(env.store, ana), status(403));
    await assert.rejects(resolveDispute(env.store, ctx(env, ana), op.id, { decision: 'cancel', note: 'me la resuelvo yo' }), status(403));
    await assert.rejects(resolveDispute(env.store, ctx(env, mod), op.id, { decision: 'otra', note: 'nota válida' }), status(400));
    await resolveDispute(env.store, ctx(env, mod), op.id, { decision: 'resume', note: 'Se reanuda con plazo' });
    assert.equal((await env.store.tx(tx => tx.operations.get(op.id)))?.status, 'pago_registrado'); // donde estaba antes de la disputa
    await openDispute(env.store, ctx(env, beto), op.id, 'El vendedor pide más dinero');
    await resolveDispute(env.store, ctx(env, mod), op.id, { decision: 'cancel', note: 'No hay acuerdo' });
    const closed = (await env.store.tx(tx => tx.operations.get(op.id)))!;
    assert.equal(closed.status, 'cancelada'); assert.match(closed.cancelReason ?? '', /moderación/);
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'publicada');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' })))[0].operationId, undefined);
    for (const id of [ana, beto]) assert.ok((await notes(env, id, 'moderation.dispute.resolved')).length >= 1);
    assert.ok((await env.store.tx(tx => tx.audit.list({ actorId: mod }))).some(row => row.action === 'moderation.dispute.cancel'));
  } finally { await env.cleanup(); }
});

// ---------------- Antifraude ----------------

test('límites de uso por acción: se bloquean al superarlos y se liberan al pasar la ventana', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const auction = await publishAuction(env, ana), fixed = await publishFixed(env, ana, 85000, 'otra');
    const seed = async (userId: string, action: string, count: number, when = env.now) => env.store.tx(async tx => { for (let i = 0; i < count; i++) await tx.audit.insert({ id: `seed-${userId}-${action}-${i}-${when.getTime()}`, actorId: userId, action, targetType: 'x', targetId: 'x', detail: {}, createdAt: when.toISOString() }); });
    const limited = (error: { status?: number; message?: string }) => error.status === 409 && /límite/.test(error.message ?? '');

    await seed(beto, 'auction.bid', 29);
    await placeBid(env.store, ctx(env, beto), auction.id, 50_000, 'clave-limite-ok'); // la 30.ª todavía pasa
    const rival = await env.addUser('Rival');
    await assert.rejects(placeBid(env.store, ctx(env, beto), auction.id, 60_000, 'clave-limite-x'), status(409)); // sigue siendo la oferta más alta
    await seed(rival, 'auction.bid', 30);
    await assert.rejects(placeBid(env.store, ctx(env, rival), auction.id, 60_000, 'clave-limite-y'), limited);
    await placeBid(env.store, ctx(env, rival, at(env, 2 * HOUR)), auction.id, 60_000, 'clave-limite-z'); // pasó la hora

    await seed(beto, 'operation.request', 10);
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), fixed.id), limited);
    const carla = await env.addUser('Carla');
    await seed(carla, 'report.create', 10);
    await assert.rejects(createReport(env.store, ctx(env, carla), { targetType: 'listing', targetId: fixed.id, reason: 'Motivo suficientemente largo' }), limited);
    await env.saveFarm(beto, { birds: [bird({ id: 'de-beto', name: 'DeBeto' })] });
    await seed(beto, 'listing.create', 20);
    await assert.rejects(createListing(deps(env), ctx(env, beto), { birdId: 'de-beto', kind: 'fixed', price: 1000 }), limited);
  } finally { await env.cleanup(); }
});

test('el precio no se puede cambiar con solicitudes u operaciones abiertas y queda auditado', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    await updateListing(deps(env), ctx(env, ana), listing.id, { price: 90000 });
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    assert.equal(op.price, 90000);
    await assert.rejects(updateListing(deps(env), ctx(env, ana), listing.id, { price: 200000 }), (error: { status?: number; message?: string }) => error.status === 409 && /precio/.test(error.message ?? ''));
    await updateListing(deps(env), ctx(env, ana), listing.id, { terms: 'Sin cambios de precio' }); // otros campos sí
    const change = (await env.store.tx(tx => tx.audit.list({ targetId: listing.id }))).find(row => row.action === 'listing.update');
    assert.deepEqual((change?.detail as { before: { price: number } }).before.price, 85000);
    // el comprador paga el precio con el que solicitó, aunque la publicación cambie después de cerrar la operación
    await cancelOperation(env.store, ctx(env, ana), (await respondPurchase(env.store, ctx(env, ana), op.id, 'accept')).id, 'Cancelo por prueba');
    await updateListing(deps(env), ctx(env, ana), listing.id, { price: 200000 });
  } finally { await env.cleanup(); }
});

// ---------------- Informes comerciales ----------------

test('el informe comercial suma solo operaciones completadas y separa ventas de compras', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    await env.saveFarm(beto, { birds: [] });
    await completeSale(env, ana, beto, 'luna', 85000);
    const open = await publishFixed(env, ana, 60000, 'otra');
    await requestPurchase(env.store, ctx(env, beto), open.id);
    await getListingForViewer(env.store, open.id, beto);
    const sales = await commercialInsights(env.store, ana, undefined, undefined, at(env, HOUR));
    assert.equal(sales.selling.sold, 1); assert.equal(sales.selling.revenue, 85000);
    assert.equal(sales.selling.listingsCreated, 2); assert.equal(sales.selling.purchaseRequests, 2);
    assert.equal(sales.buying.purchases, 0);
    const buyer = await commercialInsights(env.store, beto, undefined, undefined, at(env, HOUR));
    assert.equal(buyer.buying.purchases, 1); assert.equal(buyer.buying.spent, 85000); assert.equal(buyer.buying.requestsMade, 2);
    assert.equal(buyer.selling.revenue, 0);
    assert.match(sales.note, /no están verificados/);
    await assert.rejects(commercialInsights(env.store, ana, 'ayer', undefined, env.now), status(400));
    await assert.rejects(commercialInsights(env.store, ana, '2026-12-01', '2026-01-01', env.now), status(400));
    const empty = await commercialInsights(env.store, ana, '2020-01-01', '2020-02-01', env.now);
    assert.equal(empty.selling.sold, 0); assert.equal(empty.selling.averageDaysToSell, null);
  } finally { await env.cleanup(); }
});
