import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRange } from '../src/server/range.ts';

test('sin cabecera Range se sirve el archivo completo', () => {
  assert.deepEqual(parseRange(null, 1000), { kind: 'full' });
  assert.deepEqual(parseRange('', 1000), { kind: 'full' });
});

test('rangos válidos: inicio-fin, inicio- y últimos N bytes', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { kind: 'partial', start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=500-', 1000), { kind: 'partial', start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { kind: 'partial', start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { kind: 'partial', start: 900, end: 999 }); // el fin se recorta
  assert.deepEqual(parseRange('bytes=-5000', 1000), { kind: 'partial', start: 0, end: 999 });
});

test('rangos fuera del archivo o mal formados', () => {
  assert.deepEqual(parseRange('bytes=1000-1100', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=5-2', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=-0', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=0-1', 0), { kind: 'unsatisfiable' });
  for (const bad of ['items=0-5', 'bytes=abc', 'bytes=1-2,5-9', 'bytes=', 'bytes=--5', 'bytes=1.5-3']) assert.deepEqual(parseRange(bad, 1000), { kind: 'full' }, bad); // se ignora: respuesta completa
});
