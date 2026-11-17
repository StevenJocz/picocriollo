import assert from 'node:assert/strict';
import test from 'node:test';
import { aCuerpoDeVenta, cambio, estadoDePagoPara, fuentesDe, lineaVacia, tonoDeVenta, totalLinea, totalVenta, validarLinea, validarVenta, type BorradorDeVenta, type LineaBorrador } from '../src/features/ventas/calculos.ts';
import type { Granja } from '../src/features/granja/modelos.ts';

const granja = (): Granja => ({
  coops: [], birds: [
    { id: 'a1', name: 'Bruno', sex: 'Gallo', coopId: 'c', status: 'Activo', breed: 'Brahma' },
    { id: 'a2', name: 'Vendida', sex: 'Gallina', coopId: 'c', status: 'Vendido' },
    { id: 'p1', name: 'Piquito', sex: 'Pollito', coopId: 'c', status: 'Activo' },
  ], eggs: [], incubations: [], purchases: [], stock: [], movements: [], maintenance: [], breedingGroups: [], births: [], rings: [], birdEvents: [],
  chickLots: [{ id: 'cl1', code: 'POL-1', birthId: 'b', breed: 'Cruce', initial: 5, available: 4, sold: 1 }, { id: 'cl2', code: 'POL-2', birthId: 'b', breed: 'Cruce', initial: 2, available: 0, sold: 2 }],
  customers: [], customProducts: [{ id: 'pr1', name: 'Concentrado', unit: 'kg', price: 3000, available: 10 }, { id: 'pr2', name: 'Agotado', unit: 'kg', price: 1, available: 0 }],
  fertileLots: [
    { id: 'f1', code: 'FER-1', sourceCollectionId: 'e', sourceDestination: 'Venta', productType: 'Huevo fértil', date: '2026-10-20', coopId: 'c', breed: 'Brahma', initial: 6, available: 6, sold: 0, incubated: 0, discarded: 0, fertility: 'Pendiente' },
    { id: 'f2', code: 'FER-2', sourceCollectionId: 'e', sourceDestination: 'Incubación', productType: 'Huevo fértil', date: '2026-10-20', coopId: 'c', breed: 'Brahma', initial: 4, available: 4, sold: 0, incubated: 0, discarded: 0, fertility: 'Pendiente' },
    { id: 'f3', code: 'FER-3', sourceCollectionId: 'e', sourceDestination: 'Consumo', productType: 'Huevo consumo', date: '2026-10-20', coopId: 'c', breed: 'Criollo', initial: 12, available: 12, sold: 0, incubated: 0, discarded: 0, fertility: 'Pendiente' },
  ],
  sales: [],
});

const linea = (cambios: Partial<LineaBorrador>): LineaBorrador => ({ ...lineaVacia(), ...cambios });

test('los totales descuentan y aceptan puntos, signos y comas', () => {
  assert.equal(totalLinea({ cantidad: '4', precio: '2.500', descuento: '500' }), 9500);
  assert.equal(totalLinea({ cantidad: '2,5', precio: '$ 1000', descuento: '0' }), 2500);
  assert.equal(totalLinea({ cantidad: 'x', precio: '10', descuento: '0' }), 0);
  assert.equal(totalLinea({ cantidad: '1', precio: '100', descuento: '500' }), 0);
  assert.equal(totalVenta([linea({ cantidad: '2', precio: '1000' }), linea({ cantidad: '1', precio: '500' })]), 2500);
});

test('el estado del pago y el cambio salen del abono', () => {
  assert.equal(estadoDePagoPara(10000, 0), 'Pendiente');
  assert.equal(estadoDePagoPara(10000, 4000), 'Parcial');
  assert.equal(estadoDePagoPara(10000, 10000), 'Pagado');
  assert.equal(cambio(9500, 20000), 10500);
  assert.equal(cambio(9500, 5000), 0);
  assert.equal(tonoDeVenta('Pagado'), 'ok');
  assert.equal(tonoDeVenta('Devuelta parcial'), 'aviso');
  assert.equal(tonoDeVenta('Cancelada'), 'error');
});

test('cada producto solo ofrece lo que está disponible y se puede vender', () => {
  const g = granja();
  assert.deepEqual(fuentesDe('Huevo fértil', g).map(f => f.valor), ['f1']); // el lote reservado para incubación no se ofrece
  assert.deepEqual(fuentesDe('Huevo consumo', g).map(f => f.valor), ['f3']);
  assert.deepEqual(fuentesDe('Pollito', g).map(f => f.valor), ['lote:cl1', 'ave:p1']); // el lote agotado tampoco
  assert.deepEqual(fuentesDe('Ave adulta', g).map(f => f.valor), ['ave:a1']); // ni las vendidas ni los pollitos
  assert.deepEqual(fuentesDe('Otro', g).map(f => ({ v: f.valor, p: f.precio })), [{ v: 'pr1', p: 3000 }]);
});

test('una línea se valida antes de enviarla', () => {
  const g = granja();
  assert.match(validarLinea(linea({}), g)!, /Elige/);
  assert.match(validarLinea(linea({ origen: 'f1', cantidad: '7', precio: '1000' }), g)!, /Solo hay 6/);
  assert.match(validarLinea(linea({ origen: 'f1', cantidad: '1.5', precio: '1000' }), g)!, /enteras/);
  assert.match(validarLinea(linea({ origen: 'f1', cantidad: '1', precio: '' }), g)!, /precio/);
  assert.match(validarLinea(linea({ origen: 'f1', cantidad: '1', precio: '100', descuento: '200' }), g)!, /descuento/);
  assert.match(validarLinea(linea({ producto: 'Ave adulta', origen: 'ave:a1', cantidad: '2', precio: '1000' }), g)!, /de a una/);
  assert.equal(validarLinea(linea({ producto: 'Otro', origen: 'pr1', cantidad: '2.5', precio: '3000' }), g), null);
  assert.equal(validarLinea(linea({ origen: 'f1', cantidad: '6', precio: '1000' }), g), null);
});

test('la venta se valida completa y arma el cuerpo de la API', () => {
  const g = granja();
  const borrador: BorradorDeVenta = { clienteId: '', fecha: '2026-10-22', lineas: [linea({ origen: 'f1', cantidad: '4', precio: '2500', descuento: '500' }), linea({ producto: 'Ave adulta', origen: 'ave:a1', cantidad: '1', precio: '90000' })], abono: '99500', medio: 'Efectivo', recibido: '100000', notas: ' hola ' };
  assert.equal(validarVenta(borrador, g), null);
  assert.match(validarVenta({ ...borrador, lineas: [] }, g)!, /al menos un producto/);
  assert.match(validarVenta({ ...borrador, abono: '200000' }, g)!, /superar/);
  assert.match(validarVenta({ ...borrador, recibido: '1000' }, g)!, /efectivo recibido/);
  assert.match(validarVenta({ ...borrador, lineas: [linea({ origen: 'f1', cantidad: '9', precio: '1' })] }, g)!, /Producto 1: Solo hay 6/);

  const cuerpo = aCuerpoDeVenta(borrador, 'clave-0001', 'La Esperanza');
  assert.equal(cuerpo.paymentStatus, 'Pagado');
  assert.equal(cuerpo.paid, 99500);
  assert.equal(cuerpo.tendered, 100000);
  assert.equal(cuerpo.customerId, undefined);
  assert.equal(cuerpo.notes, 'hola');
  assert.deepEqual(cuerpo.lines[0], { product: 'Huevo fértil', description: undefined, quantity: 4, unit: 'unidad', unitPrice: 2500, discount: 500, sourceLotId: 'f1' });
  assert.equal((cuerpo.lines[1] as { birdId?: string }).birdId, 'a1');
  assert.equal(aCuerpoDeVenta({ ...borrador, abono: '0' }, 'k', 'x').paymentStatus, 'Pendiente');
  assert.equal(aCuerpoDeVenta({ ...borrador, abono: '0' }, 'k', 'x').paymentMethod, undefined);
  assert.equal((aCuerpoDeVenta({ ...borrador, lineas: [linea({ producto: 'Pollito', origen: 'lote:cl1', cantidad: '1', precio: '5' })] }, 'k', 'x').lines[0] as { sourceLotId?: string }).sourceLotId, 'cl1');
});

test('los huevos sin lote se cuentan por recolección y destino', async () => {
  const { pendientesPorAsignar } = await import('../src/features/ventas/calculos.ts');
  const g = granja();
  g.eggs = [{ id: 'e', code: 'HUE-1', date: '2026-10-20', coopId: 'c', eggs: 12, broken: 0, dirty: 0, incubation: 4, consumption: 12, sale: 8 }];
  const filas = pendientesPorAsignar(g);
  // El lote FER-1 (venta, 6 huevos) y FER-2 (incubación, 4) y FER-3 (consumo, 12) salen de la recolección «e».
  assert.deepEqual(filas.map(f => [f.destino, f.pendiente]), [['Venta', 2]]);
});
