import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { desktopSize, generate, mobileSize } from '../scripts/gen-mobile-type.ts';

test('la escala de escritorio levanta lo menor a 12 px sin pasarse de 12 y conserva el orden', () => {
  let previous = 0;
  for (let px = 7; px < 12; px++) {
    const size = desktopSize(px);
    assert.ok(size >= 10.5 && size < 12, `${px}px → ${size}px`);
    assert.ok(size > previous);
    previous = size;
  }
  assert.equal(desktopSize(12), 12);
  assert.equal(desktopSize(15), 15);
});

test('la escala móvil no deja texto por debajo de 11.5 px y conserva el orden', () => {
  let previous = 0;
  for (let px = 7; px < 16; px++) {
    const size = mobileSize(px);
    assert.ok(size >= 11.5, `${px}px → ${size}px`);
    assert.ok(size > previous, 'el orden entre tamaños se conserva');
    previous = size;
  }
  assert.equal(mobileSize(16), 16);
  assert.equal(mobileSize(0), 0);
  assert.equal(mobileSize(28), 28);
});

test('mobile-type.css coincide con lo generado desde los CSS (ejecuta npm run css:mobile si falla)', () => {
  const committed = readFileSync(new URL('../src/app/mobile-type.css', import.meta.url), 'utf8');
  assert.equal(committed, generate(path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')));
});
