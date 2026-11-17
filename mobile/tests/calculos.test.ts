import assert from 'node:assert/strict';
import test from 'node:test';
import { conteo, cuentaRegresiva, diasTranscurridos, fechaEclosion, numero, pesos, proximaEclosion, resumenGranja, sumarDias, tareaVencida } from '../src/features/granja/calculos.ts';
import type { Granja } from '../src/features/granja/modelos.ts';

const vacia = (): Granja => ({ coops: [], birds: [], eggs: [], incubations: [], purchases: [], stock: [], movements: [], maintenance: [], breedingGroups: [], births: [], rings: [], birdEvents: [], chickLots: [], customers: [], customProducts: [], fertileLots: [], sales: [] });
const ave = (id: string, sex: 'Gallina' | 'Gallo' | 'Pollito', status = 'Activo') => ({ id, name: id, sex, coopId: 'c1', status });
const huevos = (date: string, eggs: number) => ({ id: `h-${date}-${eggs}`, date, coopId: 'c1', eggs, broken: 0, dirty: 0, incubation: 0, consumption: 0, sale: 0 });

test('las fechas se suman por días de calendario, también entre meses y años', () => {
  assert.equal(sumarDias('2026-10-22', 3), '2026-10-25');
  assert.equal(sumarDias('2026-10-30', 3), '2026-11-02');
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('la eclosión se estima a 21 días más el ajuste', () => {
  assert.equal(fechaEclosion('2026-10-04'), '2026-10-25');
  assert.equal(fechaEclosion('2026-10-04', 2), '2026-10-27');
  assert.equal(fechaEclosion('2026-10-04', -3), '2026-10-22');
});

test('los días transcurridos no bajan de cero', () => {
  assert.equal(diasTranscurridos('2026-10-04', '2026-10-22'), 18);
  assert.equal(diasTranscurridos('2026-10-22', '2026-10-22'), 0);
  assert.equal(diasTranscurridos('2026-10-25', '2026-10-22'), 0);
});

test('la próxima eclosión es la de la incubación en curso más cercana', () => {
  const granja = vacia();
  granja.birds = [ave('luna', 'Gallina'), ave('nube', 'Gallina')];
  const base = { coopId: 'c1', eggs: 8, hatched: 0, removed: 0 };
  granja.incubations = [
    { id: 'i1', henId: 'luna', startedAt: '2026-10-10', status: 'En curso', ...base },
    { id: 'i2', henId: 'nube', startedAt: '2026-10-04', status: 'En curso', ...base },
    { id: 'i3', henId: 'nube', startedAt: '2026-09-01', status: 'Finalizada', ...base },
  ];
  const proxima = proximaEclosion(granja);
  assert.equal(proxima?.incubacion.id, 'i2');
  assert.equal(proxima?.gallina, 'nube');
  assert.equal(proxima?.fecha, '2026-10-25');
  assert.equal(proximaEclosion(vacia()), undefined);
});

test('la cuenta regresiva parte los días, horas, minutos y segundos hasta el mediodía', () => {
  const ahora = new Date('2026-10-22T12:00:00');
  assert.deepEqual(cuentaRegresiva('2026-10-25', ahora), { terminada: false, dias: 3, horas: 0, minutos: 0, segundos: 0 });
  const c = cuentaRegresiva('2026-10-23', new Date('2026-10-22T08:30:15'));
  assert.deepEqual(c, { terminada: false, dias: 1, horas: 3, minutos: 29, segundos: 45 });
  assert.equal(cuentaRegresiva('2026-10-22', new Date('2026-10-22T15:00:00')).terminada, true);
});

test('el resumen cuenta aves activas, huevos por período y postura', () => {
  const granja = vacia();
  granja.coops = [{ id: 'c1', name: 'A', capacity: 10, status: 'Activo' }, { id: 'c2', name: 'B', capacity: 10, status: 'Inactivo' }];
  granja.birds = [ave('g1', 'Gallina'), ave('g2', 'Gallina', 'Clueca'), ave('r1', 'Gallo', 'En reproducción'), ave('v1', 'Gallina', 'Vendido'), ave('p1', 'Pollito')];
  granja.eggs = [huevos('2026-10-22', 4), huevos('2026-10-21', 3), huevos('2026-10-10', 5), huevos('2026-09-01', 9), huevos('2026-10-23', 7)];
  const r = resumenGranja(granja, '2026-10-22');
  assert.equal(r.gallinerosActivos, 1);
  assert.equal(r.gallinerosTotal, 2);
  assert.equal(r.aves, 4);        // la vendida no cuenta
  assert.equal(r.gallinas, 2);
  assert.equal(r.gallos, 1);
  assert.equal(r.huevosHoy, 4);
  assert.equal(r.huevosSemana, 7);  // 22 y 21; el del 23 es futuro
  assert.equal(r.huevosMes, 12);    // 22, 21 y 10
  assert.equal(r.posturaPct, 100);  // 7 huevos / (1 ponedora × 7 días); la clueca no pone
  assert.equal(r.ultimosSieteDias.length, 7);
  assert.deepEqual(r.ultimosSieteDias.at(-1), { fecha: '2026-10-22', huevos: 4 });
  assert.equal(resumenGranja(vacia(), '2026-10-22').posturaPct, null);
});

test('los gastos del mes redondean cantidad por precio y dejan fuera lo viejo', () => {
  const granja = vacia();
  granja.purchases = [
    { id: 'a', date: '2026-10-12', product: 'Alimento', quantity: 40, unitPrice: 2900 },
    { id: 'b', date: '2026-10-05', product: 'Viruta', quantity: 2.5, unitPrice: 850 },
    { id: 'c', date: '2026-08-01', product: 'Viejo', quantity: 1, unitPrice: 99999 },
  ];
  assert.equal(resumenGranja(granja, '2026-10-22').gastosMes, 116000 + 2125);
});

test('las tareas próximas van por fecha y el stock bajo incluye el mínimo exacto', () => {
  const granja = vacia();
  const t = (id: string, nextDue: string, status = 'Pendiente') => ({ id, title: id, coopId: 'c1', frequencyDays: 3, nextDue, status, supplies: 0 });
  granja.maintenance = [t('d', '2026-10-30'), t('a', '2026-10-20'), t('x', '2026-10-01', 'Completada'), t('b', '2026-10-25'), t('c', '2026-10-28')];
  granja.stock = [{ id: 's1', product: 'A', quantity: 10, unit: 'kg', minimum: 10 }, { id: 's2', product: 'B', quantity: 11, unit: 'kg', minimum: 10 }];
  const r = resumenGranja(granja, '2026-10-22');
  assert.deepEqual(r.tareasProximas.map(x => x.id), ['a', 'b', 'c']);
  assert.deepEqual(r.stockBajo.map(x => x.id), ['s1']);
  assert.equal(tareaVencida(granja.maintenance[1], '2026-10-22'), true);
  assert.equal(tareaVencida(granja.maintenance[2], '2026-10-22'), false);
  assert.equal(tareaVencida(granja.maintenance[0], '2026-10-22'), false);
});

test('los números se muestran sin ceros de sobra', () => {
  assert.equal(numero(5), '5');
  assert.equal(numero(2.5), '2.5');
  assert.equal(numero(2.5 + 0.0000001), '2.5');
  assert.match(pesos(116000), /^\$116[.,]000$/);
});

test('los plurales salen bien con uno y con varios', () => {
  assert.equal(conteo(1, 'gallo', 'gallos'), '1 gallo');
  assert.equal(conteo(0, 'gallo', 'gallos'), '0 gallos');
  assert.equal(conteo(2, 'registrado', 'registrados'), '2 registrados');
});
