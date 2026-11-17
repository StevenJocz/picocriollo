import assert from 'node:assert/strict';
import test from 'node:test';
import { pickActiveReel } from '../src/features/profile/service/reel-playback.ts';

test('el reel activo es el que más se ve, siempre que pase del umbral', () => {
  assert.equal(pickActiveReel(new Map([['a', 0.2], ['b', 0.8], ['c', 0.1]])), 'b');
  assert.equal(pickActiveReel(new Map([['a', 0.55], ['b', 0.5]])), '', 'ninguno llega al 60 %: no se reproduce nada');
  assert.equal(pickActiveReel(new Map([['a', 0.6]])), 'a', 'justo en el umbral cuenta');
  assert.equal(pickActiveReel(new Map()), '');
});

test('con dos reels visibles gana el que más se ve; en empate, el primero en orden de aparición', () => {
  assert.equal(pickActiveReel(new Map([['a', 0.65], ['b', 0.9]])), 'b');
  assert.equal(pickActiveReel(new Map([['a', 0.7], ['b', 0.7]])), 'a');
});

test('el umbral se puede cambiar y los valores no válidos se ignoran', () => {
  assert.equal(pickActiveReel(new Map([['a', 0.4]]), 0.3), 'a');
  assert.equal(pickActiveReel(new Map([['a', Number.NaN], ['b', 0.7]])), 'b');
  assert.equal(pickActiveReel(new Map([['a', 1.2]])), 'a', 'ratios fuera de rango se tratan como visibles del todo');
});
