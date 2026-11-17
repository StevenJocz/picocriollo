import assert from 'node:assert/strict';
import test from 'node:test';
import { aCuerpoPublicacion, accionesDe, aPesos, publicacionInicial, siguientePaso, tiempoRestante, validarPublicacion } from '../src/features/mercado/formato.ts';

test('publicar pollitos envía lote y cantidad, sin convertirlos en aves individuales', () => {
  const base = { ...publicacionInicial(), itemType: 'lote_pollitos' as const, loteId: 'lote-uno', cantidad: '4', precio: '40000' };
  assert.deepEqual(validarPublicacion(base), {});
  const cuerpo = aCuerpoPublicacion(base, new Date('2026-10-30T12:00:00Z'), true);
  assert.equal(cuerpo.itemType, 'lote_pollitos');
  assert.equal(cuerpo.lotId, 'lote-uno');
  assert.equal(cuerpo.quantity, 4);
  assert.equal(cuerpo.birdId, undefined);
  assert.ok(validarPublicacion({ ...base, cantidad: '4.5' }).cantidad);
  assert.ok(validarPublicacion({ ...base, loteId: '' }).loteId);
});

test('cada parte solo ve los botones que la API le permitiría', () => {
  assert.deepEqual(accionesDe('vendedor', 'solicitud_recibida'), ['aceptar', 'rechazar']);
  assert.deepEqual(accionesDe('comprador', 'solicitud_recibida'), ['retirar']);
  assert.deepEqual(accionesDe('comprador', 'pago_pendiente'), ['pagar', 'cancelar', 'disputar', 'contacto']);
  assert.deepEqual(accionesDe('vendedor', 'pago_registrado'), ['confirmar_pago', 'cancelar', 'disputar', 'contacto']);
  assert.deepEqual(accionesDe('vendedor', 'entrega_pendiente'), ['entregar', 'cancelar', 'disputar', 'contacto']);
  assert.deepEqual(accionesDe('comprador', 'entrega_confirmada'), ['recibir', 'disputar', 'contacto']);
  // Con la entrega confirmada ya no se cancela: se abre una disputa.
  assert.ok(!accionesDe('vendedor', 'entrega_confirmada').includes('cancelar'));
  assert.deepEqual(accionesDe('comprador', 'completada', true), ['valorar']);
  assert.deepEqual(accionesDe('comprador', 'completada', false), []);
  assert.deepEqual(accionesDe('vendedor', 'cancelada'), []);
  assert.ok(siguientePaso('comprador', 'pago_pendiente').includes('declara'));
});

test('el tiempo restante se redondea hacia abajo y avisa cuando cerró', () => {
  const ahora = new Date('2026-10-22T12:00:00Z');
  assert.equal(tiempoRestante('2026-10-24T15:00:00Z', ahora), '2 d 3 h');
  assert.equal(tiempoRestante('2026-10-23T12:00:00Z', ahora), '1 d');
  assert.equal(tiempoRestante('2026-10-22T14:30:00Z', ahora), '2 h 30 min');
  assert.equal(tiempoRestante('2026-10-22T12:00:20Z', ahora), '1 min');
  assert.equal(tiempoRestante('2026-10-22T11:59:00Z', ahora), 'Cerrada');
  assert.equal(tiempoRestante(undefined, ahora), '');
});

test('los pesos se leen con puntos, signos y espacios', () => {
  assert.equal(aPesos('150.000'), 150000);
  assert.equal(aPesos('$ 1 200 000'), 1200000);
  assert.equal(aPesos(''), null);
  assert.ok(Number.isNaN(aPesos('12abc')));
});

test('el formulario de publicar valida según el tipo de anuncio', () => {
  const base = publicacionInicial();
  assert.deepEqual(Object.keys(validarPublicacion(base)).sort(), ['aves', 'precio']);
  assert.deepEqual(validarPublicacion({ ...base, aves: ['a1'], precio: '180.000' }), {});
  assert.equal(validarPublicacion({ ...base, aves: ['a1'], tipoAnuncio: 'interest' }).precio, undefined);

  const subasta = { ...base, aves: ['a1'], tipoAnuncio: 'auction' };
  assert.ok(validarPublicacion(subasta).precioInicial);
  assert.ok(validarPublicacion({ ...subasta, precioInicial: '500' }).precioInicial);
  assert.ok(validarPublicacion({ ...subasta, precioInicial: '100000', reserva: '50000' }).reserva);
  assert.ok(validarPublicacion({ ...subasta, precioInicial: '100000', horas: '0' }).horas);
  assert.deepEqual(validarPublicacion({ ...subasta, precioInicial: '100000', reserva: '200000', incremento: '5000' }), {});
});

test('el cuerpo de la publicación distingue un ave, un lote y una subasta', () => {
  const ahora = new Date('2026-10-22T12:00:00Z');
  const uno = aCuerpoPublicacion({ ...publicacionInicial(), aves: ['a1'], precio: '150.000', descripcion: ' Gallo fino ' }, ahora, true);
  assert.equal(uno.itemType, 'ave');
  assert.equal(uno.birdId, 'a1');
  assert.equal(uno.price, 150000);
  assert.equal(uno.publish, true);
  assert.deepEqual(uno.consent, { description: 'Gallo fino', deliveryZone: '' });

  const lote = aCuerpoPublicacion({ ...publicacionInicial(), aves: ['a1', 'a2'], precio: '90000' }, ahora, false);
  assert.equal(lote.itemType, 'lote_aves');
  assert.deepEqual(lote.birdIds, ['a1', 'a2']);
  assert.equal(lote.birdId, undefined);
  assert.equal(lote.publish, false);

  const subasta = aCuerpoPublicacion({ ...publicacionInicial(), aves: ['a1'], tipoAnuncio: 'auction', precioInicial: '100.000', horas: '24', reserva: '150000' }, ahora, true);
  assert.deepEqual(subasta.auction, { startingPrice: 100000, antiSniping: true, closesAt: '2026-10-23T12:00:00.000Z', reservePrice: 150000 });
  assert.equal(subasta.price, undefined);
});

for (const itemType of ['lote_huevos', 'insumo'] as const) {
  test(`publicar ${itemType} valida cantidades y envía la fuente correcta`, () => {
    const valores = { ...publicacionInicial(), itemType, loteId: 'fuente-1', cantidad: '6', precio: '25000', aves: ['ignorada'] };
    assert.deepEqual(validarPublicacion(valores), {});
    const body = aCuerpoPublicacion(valores, new Date(), true);
    assert.equal(body.itemType, itemType);
    assert.equal(body.lotId, 'fuente-1');
    assert.equal(body.quantity, 6);
    assert.equal(body.birdId, undefined);
    assert.equal(body.birdIds, undefined);
    assert.ok(validarPublicacion({ ...valores, loteId: '' }).loteId);
    for (const cantidad of ['0', '-1', '1.5', 'abc']) assert.ok(validarPublicacion({ ...valores, cantidad }).cantidad);
  });
}
