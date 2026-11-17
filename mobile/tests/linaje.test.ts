import test from 'node:test';
import assert from 'node:assert/strict';
import { generaciones, hermanos } from '../src/features/granja/linaje.ts';
import { seccionDeRuta } from '../src/components/navegacion.ts';
import type { Ave } from '../src/features/granja/modelos.ts';

const ave = (id: string, motherId?: string, fatherId?: string): Ave => ({ id, name: id, motherId, fatherId, sex: 'Gallina', coopId: 'corral', status: 'Activo' });

test('el linaje recorre todas las generaciones registradas sin duplicar ancestros compartidos', () => {
  const aves = [ave('abuela'), ave('madre', 'abuela'), ave('padre', 'abuela'), ave('hija', 'madre', 'padre'), ave('nieta', 'hija')];
  assert.deepEqual(generaciones(aves, 'hija', 'ascendencia').map(f => f.map(a => a.id)), [['madre', 'padre'], ['abuela']]);
  assert.deepEqual(generaciones(aves, 'abuela', 'descendencia').map(f => f.map(a => a.id)), [['madre', 'padre'], ['hija'], ['nieta']]);
});
test('el árbol no entra en bucles con registros antiguos y no inventa padres faltantes', () => {
  const aves = [ave('uno', 'dos', 'inexistente'), ave('dos', 'uno')];
  assert.deepEqual(generaciones(aves, 'uno', 'ascendencia').map(f => f.map(a => a.id)), [['dos']]);
  assert.deepEqual(generaciones(aves, 'uno', 'descendencia').map(f => f.map(a => a.id)), [['dos']]);
});
test('no corta la descendencia a una cantidad fija de generaciones', () => {
  const aves = Array.from({ length: 20 }, (_, i) => ave(String(i), i ? String(i - 1) : undefined));
  assert.equal(generaciones(aves, '0', 'descendencia').length, 19);
});
test('desconocer los padres no convierte a todas las aves en hermanas', () => {
  assert.deepEqual(hermanos([ave('uno'), ave('dos')], ave('uno')), []);
  assert.deepEqual(hermanos([ave('uno', 'madre'), ave('dos', 'madre')], ave('uno', 'madre')).map(a => a.id), ['dos']);
});
test('Inicio es reels; mercado y perfil permanecen separados de Mi granja', () => {
  assert.equal(seccionDeRuta('/inicio'), 'inicio');
  assert.equal(seccionDeRuta('/reels/publicacion/1'), 'inicio');
  assert.equal(seccionDeRuta('/mercado/1'), 'mercado');
  assert.equal(seccionDeRuta('/perfil/1'), 'perfil');
  for (const ruta of ['/granja', '/aves', '/formulario/ave', '/linaje', '/ventas/1']) assert.equal(seccionDeRuta(ruta), 'granja');
});
