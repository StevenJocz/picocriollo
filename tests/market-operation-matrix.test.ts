import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, markDelivered, openDispute, requestPurchase, respondPurchase, shareContact, withdrawRequest } from '../src/features/market/service/operations.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, notes, publishFixed, sellerWithBird } from './helpers/market.ts';

type Status = 'solicitud_recibida' | 'pago_pendiente' | 'pago_registrado' | 'entrega_pendiente' | 'entrega_confirmada' | 'completada' | 'cancelada' | 'disputada';
type Actor = 'comprador' | 'vendedor' | 'ajeno';
const STATUSES: Status[] = ['solicitud_recibida', 'pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada', 'completada', 'cancelada', 'disputada'];
const ACTORS: Actor[] = ['comprador', 'vendedor', 'ajeno'];

interface World { env: TestEnv; ids: Record<Actor, string>; listingId: string; opId: string; }
const REASON = 'Motivo de prueba suficientemente largo';

async function world(target: Status): Promise<World> {
  const env = await makeEnv();
  const vendedor = await sellerWithBird(env), comprador = await env.addUser('Beto'), ajeno = await env.addUser('Carla');
  const listing = await publishFixed(env, vendedor);
  const c = (id: string) => ctx(env, id);
  const op = await requestPurchase(env.store, c(comprador), listing.id);
  const ids = { comprador, vendedor, ajeno };
  const w = { env, ids, listingId: listing.id, opId: op.id };
  if (target === 'solicitud_recibida') return w;
  if (target === 'cancelada') { await respondPurchase(env.store, c(vendedor), op.id, 'reject'); return w; }
  await respondPurchase(env.store, c(vendedor), op.id, 'accept');
  if (target === 'pago_pendiente') return w;
  if (target === 'disputada') { await openDispute(env.store, c(comprador), op.id, REASON); return w; }
  await declarePayment(env.store, c(comprador), op.id, 'Nequi');
  if (target === 'pago_registrado') return w;
  await confirmPayment(env.store, c(vendedor), op.id);
  if (target === 'entrega_pendiente') return w;
  await markDelivered(env.store, c(vendedor), op.id);
  if (target === 'entrega_confirmada') return w;
  await confirmReceipt(env.store, c(comprador), op.id);
  return w;
}

interface Rule { who: Actor[]; from: Status[] }
const IN_PROGRESS: Status[] = ['pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada'];
// Fuente de verdad de la máquina de estados (la misma que la interfaz usa para mostrar botones).
const RULES: Record<string, Rule> = {
  aceptar: { who: ['vendedor'], from: ['solicitud_recibida'] },
  rechazar: { who: ['vendedor'], from: ['solicitud_recibida'] },
  retirar_solicitud: { who: ['comprador'], from: ['solicitud_recibida'] },
  declarar_pago: { who: ['comprador'], from: ['pago_pendiente'] },
  confirmar_pago: { who: ['vendedor'], from: ['pago_pendiente', 'pago_registrado'] },
  marcar_entregado: { who: ['vendedor'], from: ['entrega_pendiente'] },
  confirmar_recepcion: { who: ['comprador'], from: ['entrega_confirmada'] },
  cancelar: { who: ['comprador', 'vendedor'], from: ['pago_pendiente', 'pago_registrado', 'entrega_pendiente'] },
  disputar: { who: ['comprador', 'vendedor'], from: ['pago_pendiente', 'pago_registrado', 'entrega_pendiente', 'entrega_confirmada'] },
  compartir_contacto: { who: ['comprador', 'vendedor'], from: IN_PROGRESS },
};
const RUN: Record<string, (w: World, userId: string) => Promise<unknown>> = {
  aceptar: (w, u) => respondPurchase(w.env.store, ctx(w.env, u), w.opId, 'accept'),
  rechazar: (w, u) => respondPurchase(w.env.store, ctx(w.env, u), w.opId, 'reject'),
  retirar_solicitud: (w, u) => withdrawRequest(w.env.store, ctx(w.env, u), w.opId),
  declarar_pago: (w, u) => declarePayment(w.env.store, ctx(w.env, u), w.opId, 'Efectivo'),
  confirmar_pago: (w, u) => confirmPayment(w.env.store, ctx(w.env, u), w.opId),
  marcar_entregado: (w, u) => markDelivered(w.env.store, ctx(w.env, u), w.opId),
  confirmar_recepcion: (w, u) => confirmReceipt(w.env.store, ctx(w.env, u), w.opId),
  cancelar: (w, u) => cancelOperation(w.env.store, ctx(w.env, u), w.opId, REASON),
  disputar: (w, u) => openDispute(w.env.store, ctx(w.env, u), w.opId, REASON),
  compartir_contacto: (w, u) => shareContact(w.env.store, ctx(w.env, u), w.opId),
};

/** Cualquier persona ajena a la operación recibe 403; quien participa pero con el rol equivocado, 403; con el rol correcto en un estado equivocado, 409. */
function expected(action: string, actor: Actor, status: Status): 'ok' | 403 | 409 {
  const rule = RULES[action];
  if (!rule.who.includes(actor)) return 403;
  return rule.from.includes(status) ? 'ok' : 409;
}

test('matriz completa: cada acción, en cada estado, por cada persona, hace lo que debe', async () => {
  const failures: string[] = [];
  let checked = 0;
  for (const status of STATUSES) {
    for (const action of Object.keys(RULES)) {
      for (const actor of ACTORS) {
        const w = await world(status);
        try {
          const want = expected(action, actor, status);
          let got: 'ok' | number;
          try { await RUN[action](w, w.ids[actor]); got = 'ok'; } catch (error) { got = (error as { status?: number }).status ?? -1; }
          checked++;
          if (got !== want) failures.push(`${action} · ${actor} · ${status}: esperado ${want}, obtenido ${got}`);
        } finally { await w.env.cleanup(); }
      }
    }
  }
  assert.equal(checked, STATUSES.length * Object.keys(RULES).length * ACTORS.length);
  assert.deepEqual(failures, [], `Discrepancias:\n${failures.join('\n')}`);
});

test('una operación inexistente responde 404 en todas las acciones', async () => {
  const w = await world('solicitud_recibida');
  try {
    for (const action of Object.keys(RUN)) {
      await assert.rejects(RUN[action]({ ...w, opId: 'no-existe' }, w.ids.vendedor), (error: { status?: number }) => error.status === 404, action);
    }
  } finally { await w.env.cleanup(); }
});

test('declarar el pago: medio válido, sin repetirse y con aviso al vendedor', async () => {
  const w = await world('pago_pendiente');
  try {
    const run = (method: unknown) => declarePayment(w.env.store, ctx(w.env, w.ids.comprador), w.opId, method);
    for (const bad of [undefined, null, 42, '', ' ', 'x', 'y'.repeat(61), {}]) await assert.rejects(run(bad), (error: { status?: number }) => error.status === 400, `medio ${JSON.stringify(bad)}`);
    const op = await run('  Transferencia Bancolombia ');
    assert.equal(op.status, 'pago_registrado');
    assert.equal(op.paymentMethod, 'Transferencia Bancolombia');
    await assert.rejects(run('Efectivo'), (error: { status?: number }) => error.status === 409); // doble clic
    assert.equal((await notes(w.env, w.ids.vendedor, 'market.operation.payment_declared')).length, 1);
  } finally { await w.env.cleanup(); }
});

test('los motivos de cancelar y disputar exigen entre 10 y 500 caracteres', async () => {
  for (const [label, act] of [['cancelar', cancelOperation], ['disputar', openDispute]] as const) {
    const w = await world('pago_pendiente');
    try {
      const run = (reason: unknown) => act(w.env.store, ctx(w.env, w.ids.comprador), w.opId, reason);
      for (const bad of [undefined, null, '', 'corto', ' '.repeat(20), 'x'.repeat(501), 12345678901]) await assert.rejects(run(bad), (error: { status?: number }) => error.status === 400, `${label}: ${JSON.stringify(bad)}`);
      await run('x'.repeat(500));
    } finally { await w.env.cleanup(); }
  }
});

test('confirmar la recepción dos veces a la vez transfiere una sola vez', async () => {
  const w = await world('entrega_confirmada');
  try {
    const results = await Promise.allSettled([RUN.confirmar_recepcion(w, w.ids.comprador), RUN.confirmar_recepcion(w, w.ids.comprador)]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.filter(row => row.status === 'rejected' && (row.reason as { status?: number }).status === 409).length, 1);
    await w.env.store.tx(async tx => {
      assert.equal((await tx.receipts.list({ operationId: w.opId })).length, 1);
      assert.equal((await tx.invoices.list({ operationId: w.opId })).length, 1);
    });
  } finally { await w.env.cleanup(); }
});

test('dos compradores piden a la vez y solo uno puede ser aceptado', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const listing = await publishFixed(env, ana);
    const [a, b] = await Promise.all([requestPurchase(env.store, ctx(env, beto), listing.id), requestPurchase(env.store, ctx(env, carla), listing.id)]);
    const first = await respondPurchase(env.store, ctx(env, ana), a.id, 'accept');
    assert.equal(first.status, 'pago_pendiente');
    await assert.rejects(respondPurchase(env.store, ctx(env, ana), b.id, 'accept'), (error: { status?: number }) => error.status === 409);
    await assert.rejects(requestPurchase(env.store, ctx(env, beto), listing.id), (error: { status?: number }) => error.status === 404 || error.status === 409);
  } finally { await env.cleanup(); }
});

test('el flujo completo notifica en cada paso a la otra parte y deja factura', async () => {
  const w = await world('completada');
  try {
    assert.equal((await notes(w.env, w.ids.vendedor, 'market.purchase.requested')).length, 1);
    assert.equal((await notes(w.env, w.ids.comprador, 'market.purchase.accepted')).length, 1);
    assert.equal((await notes(w.env, w.ids.vendedor, 'market.operation.payment_declared')).length, 1);
    assert.equal((await notes(w.env, w.ids.comprador, 'market.operation.payment_confirmed')).length, 1);
    assert.equal((await notes(w.env, w.ids.comprador, 'market.operation.delivered')).length, 1);
    assert.equal((await notes(w.env, w.ids.vendedor, 'market.transfer.completed')).length, 1);
    assert.equal((await notes(w.env, w.ids.comprador, 'market.invoice.issued')).length, 1);
    assert.equal((await notes(w.env, w.ids.vendedor, 'market.invoice.issued')).length, 1);
    assert.equal((await notes(w.env, w.ids.ajeno)).length, 0);
  } finally { await w.env.cleanup(); }
});
