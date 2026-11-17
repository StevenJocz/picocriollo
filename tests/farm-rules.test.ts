import test from 'node:test';
import assert from 'node:assert/strict';
import { canConsume, eggAllocationValid, elapsedDays, estimatedHatchDate, nextMaintenanceDate, purchaseTotal, validateNumeric } from '../src/features/farm/service/rules.ts';

test('calcula la eclosión como fecha estimada 21 días después del inicio',()=>{
 assert.equal(estimatedHatchDate('2026-10-01'),'2026-10-22');
 assert.equal(estimatedHatchDate('2026-10-01',2),'2026-10-24');
});
test('calcula días transcurridos sin valores negativos',()=>{
 assert.equal(elapsedDays('2026-10-10',new Date('2026-10-16T15:00:00')),6);
 assert.equal(elapsedDays('2026-10-20',new Date('2026-10-16T15:00:00')),0);
});
test('calcula siguiente mantenimiento desde la fecha real',()=>{
 assert.equal(nextMaintenanceDate('2026-10-13',7),'2026-10-20');
});
test('rechaza cantidades inválidas o bajo el mínimo',()=>{
 assert.match(validateNumeric('-2','Cantidad')||'',/cero o mayor/);
 assert.match(validateNumeric('1','Frecuencia',2)||'',/al menos 2/);
 assert.equal(validateNumeric('2','Cantidad',2),null);
});
test('valida que los destinos de huevos no superen la recolección',()=>{
 assert.equal(eggAllocationValid(12,3,4,5),true);
 assert.equal(eggAllocationValid(12,3,5,5),false);
});
test('el consumo no puede superar la existencia y una compra calcula su total',()=>{
 assert.equal(canConsume(7,10),true);
 assert.equal(canConsume(11,10),false);
 assert.equal(canConsume(0,10),false);
 assert.equal(purchaseTotal(2.5,2800),7000);
});
