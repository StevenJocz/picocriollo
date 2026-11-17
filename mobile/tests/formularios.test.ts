import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULOS, aCuerpo, esModulo, opcionesDe, validar, valoresIniciales } from '../src/features/granja/formularios.ts';
import type { Granja } from '../src/features/granja/modelos.ts';

const vacia = (): Granja => ({ coops: [], birds: [], eggs: [], incubations: [], purchases: [], stock: [], movements: [], maintenance: [], breedingGroups: [], births: [], rings: [], birdEvents: [], chickLots: [], customers: [], customProducts: [], fertileLots: [], sales: [] });

test('un formulario nuevo trae los valores predeterminados (la fecha de hoy, los ceros, los estados)', () => {
  const v = valoresIniciales(MODULOS.recoleccion);
  assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(v.broken, '0');
  assert.equal(v.eggs, '');
  assert.equal(valoresIniciales(MODULOS.gallinero).status, 'Activo');
  assert.equal(valoresIniciales(MODULOS.incubacion).type, 'Natural');
});

test('al editar se cargan los valores del registro y los números se muestran sin ceros de sobra', () => {
  const v = valoresIniciales(MODULOS.compra, { date: '2026-10-10', product: 'Maíz', quantity: 2.5, unitPrice: 2400, unit: 'kg', category: 'Maíz triturado' });
  assert.equal(v.quantity, '2.5');
  assert.equal(v.unitPrice, '2400');
  assert.equal(v.category, 'Maíz triturado');
  // Un estado que el registro no trae vuelve a su valor por defecto.
  assert.equal(valoresIniciales(MODULOS.gallinero, { name: 'A', capacity: 4 }).status, 'Activo');
});

test('los datos obligatorios se piden y los números y fechas se revisan', () => {
  const e = validar(MODULOS.gallinero, { name: ' ', capacity: '0', startedAt: 'ayer', status: 'Activo' });
  assert.equal(e.name, 'Este dato es obligatorio.');
  assert.equal(e.capacity, 'Debe ser al menos 1.');
  assert.match(e.startedAt, /AAAA-MM-DD/);
  assert.deepEqual(validar(MODULOS.gallinero, { name: 'La Arboleda', capacity: '42', startedAt: '2026-01-05' }), {});
  assert.equal(validar(MODULOS.compra, { quantity: '0', unitPrice: '10', date: '2026-10-10', product: 'A' }).quantity, 'Debe ser mayor que 0.');
  assert.equal(validar(MODULOS.compra, { quantity: '2,5', unitPrice: '10', date: '2026-10-10', product: 'A' }).quantity, undefined);   // coma decimal
  assert.equal(validar(MODULOS.recoleccion, { eggs: '3.5', date: '2026-10-10', coopId: 'c' }).eggs, 'Escribe un número entero.');
  assert.equal(validar(MODULOS.ave, { name: 'Luna', sex: '', coopId: '' }).sex, 'Elige una opción.');
});

test('los campos que dependen de otro solo se piden cuando se ven', () => {
  const natural = validar(MODULOS.incubacion, { type: 'Natural', coopId: 'c', startedAt: '2026-10-10', eggs: '8', status: 'En curso' });
  assert.equal(natural.henId, 'Elige una opción.');
  const artificial = validar(MODULOS.incubacion, { type: 'Artificial', coopId: 'c', startedAt: '2026-10-10', eggs: '8', status: 'En curso' });
  assert.equal(artificial.henId, undefined);
  const cuerpo = aCuerpo(MODULOS.incubacion, { type: 'Artificial', henId: 'vieja', equipment: 'Incubadora 48', coopId: 'c', startedAt: '2026-10-10', eggs: '8', hatched: '0', removed: '0', status: 'En curso' });
  assert.equal('henId' in cuerpo, false);
  assert.equal(cuerpo.equipment, 'Incubadora 48');
});

test('el cuerpo lleva números como números y omite lo opcional que está vacío', () => {
  const cuerpo = aCuerpo(MODULOS.incubacion, { type: 'Natural', henId: 'h1', coopId: 'c', startedAt: '2026-10-10', eggs: '8', hatched: '', removed: '1', hatchAdjustmentDays: '', status: 'En curso', notes: '' });
  assert.equal(cuerpo.eggs, 8);
  assert.equal(cuerpo.hatched, 0);          // vacío en un entero sin omitirVacio vale 0
  assert.equal('hatchAdjustmentDays' in cuerpo, false);
  assert.equal(cuerpo.notes, '');
  const compra = aCuerpo(MODULOS.compra, { date: '2026-10-10', product: ' Maíz ', quantity: '2,5', unitPrice: '2400', unit: 'kg', category: 'Otros', supplier: '', coopId: '', notes: '' });
  assert.equal(compra.product, 'Maíz');
  assert.equal(compra.quantity, 2.5);
  const gallinero = aCuerpo(MODULOS.gallinero, { name: 'A', capacity: '5', type: '', status: 'Activo' });
  assert.equal('type' in gallinero, false);
});

test('las listas de elegir separan gallinas y gallos y dejan fuera las aves que ya no están', () => {
  const g = vacia();
  g.coops = [{ id: 'c1', name: 'La Arboleda', capacity: 5, status: 'Activo' }];
  g.birds = [
    { id: 'a', name: 'Luna', sex: 'Gallina', coopId: 'c1', status: 'Activo' },
    { id: 'b', name: 'Nube', sex: 'Gallina', coopId: 'c1', status: 'Vendido' },
    { id: 'c', name: 'Tizón', sex: 'Gallo', coopId: 'c1', status: 'En reproducción' },
  ];
  g.stock = [{ id: 's', product: 'Maíz', quantity: 12.5, unit: 'kg', minimum: 5 }];
  assert.deepEqual(opcionesDe('gallinas', g), [{ valor: 'a', etiqueta: 'Luna' }]);
  assert.deepEqual(opcionesDe('gallos', g), [{ valor: 'c', etiqueta: 'Tizón' }]);
  assert.deepEqual(opcionesDe('coops', g), [{ valor: 'c1', etiqueta: 'La Arboleda' }]);
  assert.deepEqual(opcionesDe('stock', g), [{ valor: 's', etiqueta: 'Maíz (12.5 kg)' }]);
});

test('solo existen los módulos definidos', () => {
  assert.equal(esModulo('ave'), true);
  assert.equal(esModulo('mercado'), false);
  assert.equal(esModulo(undefined), false);
  assert.equal(MODULOS.consumo.soloCrear, true);
});

test('el grupo reproductor pide gallo y gallinas, y manda las gallinas como lista', () => {
  const e = validar(MODULOS.grupo, { name: 'Primavera', roosterId: '', henIds: '', startedAt: '2026-10-01', status: 'Activo' });
  assert.equal(e.roosterId, 'Elige una opción.');
  assert.equal(e.henIds, 'Elige al menos una.');
  const cuerpo = aCuerpo(MODULOS.grupo, { name: 'Primavera', roosterId: 'g1', henIds: 'h1, h2,,h3', startedAt: '2026-10-01', endedAt: '', status: 'Activo', coopId: '', breed: '', notes: '' });
  assert.deepEqual(cuerpo.henIds, ['h1', 'h2', 'h3']);
  // Al editar, la lista que guarda la granja vuelve a mostrarse separada por comas.
  assert.equal(valoresIniciales(MODULOS.grupo, { name: 'X', henIds: ['h1', 'h2'], roosterId: 'g1', startedAt: '2026-10-01' }).henIds, 'h1,h2');
});

test('el nacimiento exige incubación, fecha y al menos un pollito, y ofrece las incubaciones de la granja', () => {
  const e = validar(MODULOS.nacimiento, { incubationId: '', date: '2026-10-22', count: '0', parentageStatus: '' });
  assert.equal(e.incubationId, 'Elige una opción.');
  assert.equal(e.count, 'Debe ser al menos 1.');
  const granja: Granja = { ...vacia(), incubations: [{ id: 'i1', code: 'INC-0001', type: 'Natural', coopId: 'c', startedAt: '2026-10-01', eggs: 8, hatched: 0, removed: 0, status: 'En curso' }] };
  assert.deepEqual(opcionesDe('incubaciones', granja), [{ valor: 'i1', etiqueta: 'Clueca INC-0001 · 2026-10-01 · En curso' }]);
  // Sin elegir el parentesco no se envía: el servidor lo deja sin definir.
  assert.equal('parentageStatus' in aCuerpo(MODULOS.nacimiento, { incubationId: 'i1', date: '2026-10-22', count: '4', parentageStatus: '', coopId: '', breed: '', notes: '', motherId: '', fatherId: '' }), false);
});
