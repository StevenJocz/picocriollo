import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing, getListingForViewer, myListings } from '../src/features/market/service/listings.ts';
import { listOperations, requestPurchase, respondPurchase, withdrawRequest } from '../src/features/market/service/operations.ts';
import { getThread, listThreads, sendMessage } from '../src/features/market/service/messages.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, notes, publishAuction, publishFixed, sellerWithBird, status } from './helpers/market.ts';

test('solicitar compra registra el interés y avisa al vendedor, pero no vende ni bloquea al ave', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id, 'Quiero comprarla');
    assert.equal(op.status, 'solicitud_recibida');
    assert.equal(op.price, 85000);
    const after = await env.store.tx(tx => tx.listings.get(listing.id));
    assert.equal(after?.status, 'publicada'); // no se marca vendida solo por pulsar "Comprar"
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' })))[0].operationId, undefined);
    const [note] = await notes(env, ana, 'market.purchase.requested');
    assert.match(note.body, /Beto/); assert.match(note.body, /no se completa hasta que lo decidas/);
    assert.equal((await myListings(env.store, ana))[0].pendingRequests, 1);
    assert.equal((await getListingForViewer(env.store, listing.id, beto)).viewer.operationStatus, 'solicitud_recibida');
    assert.equal((await listThreads(env.store, beto)).length, 1); // el mensaje inicial abrió la conversación
  } finally { await env.cleanup(); }
});

test('validaciones de la solicitud: duplicada, propia, subasta y publicación de interés', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const fixed = await publishFixed(env, ana);
    await requestPurchase(env.store, ctx(env, beto), fixed.id);
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), fixed.id), status(409));
    await assert.rejects(requestPurchase(env.store, ctx(env, ana), fixed.id), status(403));
    const auction = await publishAuction(env, ana, {}, 'otra');
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), auction.id), (error: { status?: number; message?: string }) => error.status === 409 && /oferta/.test(error.message ?? ''));
    await env.saveFarm(ana, { birds: [...((await env.farm(ana)).birds as Record<string, unknown>[]), { id: 'tercera', code: 'AVE-9', name: 'Tercera', sex: 'Gallina', breed: 'Criolla', coopId: '', status: 'Activo', bornAt: '', origin: '', motherId: '', fatherId: '', photo: '', notes: '' }] });
    const interest = await createListing(deps(env), ctx(env, ana), { birdId: 'tercera', kind: 'interest', publish: true });
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), interest.id), status(409));
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), 'no-existe'), status(404));
  } finally { await env.cleanup(); }
});

test('aceptar reserva el ave para esa operación y cierra las demás solicitudes; solo un comprador avanza', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const opBeto = await requestPurchase(env.store, ctx(env, beto), listing.id);
    const opCarla = await requestPurchase(env.store, ctx(env, carla), listing.id);
    await assert.rejects(respondPurchase(env.store, ctx(env, beto), opBeto.id, 'accept'), status(403));
    const accepted = await respondPurchase(env.store, ctx(env, ana), opBeto.id, 'accept');
    assert.equal(accepted.status, 'pago_pendiente');
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'en_operacion');
    assert.equal((await env.store.tx(tx => tx.locks.list({ birdId: 'luna', status: 'active' })))[0].operationId, opBeto.id);
    const carlaAfter = (await env.store.tx(tx => tx.operations.get(opCarla.id)))!;
    assert.equal(carlaAfter.status, 'cancelada'); assert.match(carlaAfter.cancelReason ?? '', /otra solicitud/);
    await assert.rejects(respondPurchase(env.store, ctx(env, ana), opCarla.id, 'accept'), status(409));
    await assert.rejects(requestPurchase(env.store, ctx(env, carla), listing.id), status(404)); // ya no está disponible
    assert.equal((await notes(env, beto, 'market.purchase.accepted'))[0].critical, true);
    assert.equal((await notes(env, carla, 'market.purchase.rejected')).length, 1);
    assert.equal((await notes(env, carla, 'market.purchase.accepted')).length, 0);
  } finally { await env.cleanup(); }
});

test('dos aceptaciones simultáneas del vendedor: solo una operación queda aceptada', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const a = await requestPurchase(env.store, ctx(env, beto), listing.id), b = await requestPurchase(env.store, ctx(env, carla), listing.id);
    const results = await Promise.allSettled([respondPurchase(env.store, ctx(env, ana), a.id, 'accept'), respondPurchase(env.store, ctx(env, ana), b.id, 'accept')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const ops = await env.store.tx(tx => tx.operations.list({ listingId: listing.id }));
    assert.equal(ops.filter(op => op.status === 'pago_pendiente').length, 1);
  } finally { await env.cleanup(); }
});

test('rechazar deja la publicación disponible y avisa al comprador', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    const rejected = await respondPurchase(env.store, ctx(env, ana), op.id, 'reject');
    assert.equal(rejected.status, 'cancelada');
    assert.equal((await env.store.tx(tx => tx.listings.get(listing.id)))?.status, 'publicada');
    assert.match((await notes(env, beto, 'market.purchase.rejected'))[0].body, /Rechazada por el vendedor/);
    await requestPurchase(env.store, ctx(env, beto), listing.id); // puede volver a solicitar
  } finally { await env.cleanup(); }
});

test('el comprador puede retirar su solicitud pendiente; nadie más', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await assert.rejects(withdrawRequest(env.store, ctx(env, carla), op.id), status(403));
    await assert.rejects(withdrawRequest(env.store, ctx(env, ana), op.id), status(403));
    assert.equal((await withdrawRequest(env.store, ctx(env, beto), op.id)).status, 'cancelada');
    await assert.rejects(withdrawRequest(env.store, ctx(env, beto), op.id), status(409));
    assert.equal((await listOperations(env.store, beto, 'comprador'))[0].status, 'cancelada');
    assert.equal((await listOperations(env.store, ana, 'vendedor')).length, 1);
    assert.equal((await listOperations(env.store, carla)).length, 0);
  } finally { await env.cleanup(); }
});

test('mensajería: el comprador abre la conversación, el vendedor responde y un tercero no puede leerla', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const first = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: '¿Sigue disponible?' });
    await assert.rejects(sendMessage(env.store, ctx(env, ana), { listingId: listing.id, body: 'hola' }), status(403));
    await sendMessage(env.store, ctx(env, ana), { threadId: first.threadId, body: 'Sí, está disponible' });
    await assert.rejects(sendMessage(env.store, ctx(env, carla), { threadId: first.threadId, body: 'intruso' }), status(403));
    await assert.rejects(getThread(env.store, carla, first.threadId), status(403));
    const thread = await getThread(env.store, beto, first.threadId);
    assert.deepEqual(thread.messages.map(m => [m.mine, m.body]), [[true, '¿Sigue disponible?'], [false, 'Sí, está disponible']]);
    assert.equal((await listThreads(env.store, ana))[0].counterpart, 'Beto');
    assert.equal(JSON.stringify(await listThreads(env.store, ana)).includes('correo.test'), false);
    assert.equal((await notes(env, ana, 'market.message.created')).length, 1);
    assert.equal((await notes(env, beto, 'market.message.created')).length, 1);
    assert.equal((await notes(env, carla)).length, 0);
    const second = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Gracias' });
    assert.equal(second.threadId, first.threadId); // una conversación por comprador y publicación
  } finally { await env.cleanup(); }
});

test('el chat no admite teléfonos ni correos antes de aceptar la operación', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    for (const body of ['escríbeme a beto@correo.com', 'llámame al 300 123 4567', 'mi número 3001234567']) {
      await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body }), (error: { status?: number; message?: string }) => error.status === 400 && /teléfono ni correo/.test(error.message ?? ''));
    }
    await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Pesa unos 2 kilos, ¿cierto? Tiene 14 meses' });
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    const sent = await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'Mi teléfono es 300 123 4567' });
    assert.ok(sent.messageId);
  } finally { await env.cleanup(); }
});

test('mensajes vacíos, demasiado largos o en un límite de ritmo se rechazan', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto');
    const listing = await publishFixed(env, ana);
    await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: '   ' }), status(400));
    await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'x'.repeat(1001) }), status(400));
    await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 42 as never }), status(400));
    for (let i = 0; i < 30; i++) await sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: `mensaje ${i}` });
    await assert.rejects(sendMessage(env.store, ctx(env, beto), { listingId: listing.id, body: 'uno más' }), status(409));
  } finally { await env.cleanup(); }
});
