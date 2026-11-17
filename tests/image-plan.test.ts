import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATAR_SIDE, FULL_MAX_SIDE, KEEP_ORIGINAL_BYTES, avatarCrop, chooseSmaller, planFull, planThumb } from '../src/features/profile/service/image-plan.ts';

test('una foto liviana y ya comprimida se conserva tal cual (sin pérdida adicional)', () => {
  assert.deepEqual(planFull({ width: 1600, height: 1200, size: 400_000, type: 'image/jpeg' }), { width: 1600, height: 1200, resize: false, keepOriginal: true });
  assert.equal(planFull({ width: 1000, height: 1000, size: KEEP_ORIGINAL_BYTES, type: 'image/webp' }).keepOriginal, true);
});

test('una foto pesada se re-codifica; una PNG siempre se re-codifica; no se amplía nunca', () => {
  assert.equal(planFull({ width: 4000, height: 3000, size: 5_000_000, type: 'image/jpeg' }).keepOriginal, false);
  assert.equal(planFull({ width: 800, height: 600, size: 50_000, type: 'image/png' }).keepOriginal, false);
  assert.equal(planFull({ width: 2000, height: 1500, size: KEEP_ORIGINAL_BYTES + 1, type: 'image/jpeg' }).keepOriginal, false);
  assert.deepEqual(planFull({ width: 640, height: 480, size: 9_000_000, type: 'image/jpeg' }), { width: 640, height: 480, resize: false, keepOriginal: false });
});

test('solo se reduce el tamaño si el lado mayor supera el tope, conservando la proporción', () => {
  assert.deepEqual(planFull({ width: 6000, height: 4000, size: 8_000_000, type: 'image/jpeg' }), { width: FULL_MAX_SIDE, height: 2000, resize: true, keepOriginal: false });
  assert.deepEqual(planFull({ width: 3000, height: 3000, size: 8_000_000, type: 'image/jpeg' }).resize, false);
  const tall = planFull({ width: 1000, height: 9000, size: 3_000_000, type: 'image/png' });
  assert.deepEqual([tall.width, tall.height, tall.resize], [333, FULL_MAX_SIDE, true]);
});

test('la miniatura es más pequeña y nunca queda en cero', () => {
  assert.deepEqual(planThumb({ width: 4000, height: 3000 }), { width: 720, height: 540 });
  assert.deepEqual(planThumb({ width: 300, height: 200 }), { width: 300, height: 200 });
  assert.deepEqual(planThumb({ width: 1, height: 5000 }), { width: 1, height: 720 });
});

test('si el resultado re-codificado pesa más que el original sin reducir, se queda el original', () => {
  assert.equal(chooseSmaller({ originalSize: 900_000, encodedSize: 1_100_000, resized: false, originalAllowed: true }), 'original');
  assert.equal(chooseSmaller({ originalSize: 900_000, encodedSize: 400_000, resized: false, originalAllowed: true }), 'encoded');
  assert.equal(chooseSmaller({ originalSize: 9_000_000, encodedSize: 2_000_000, resized: true, originalAllowed: true }), 'encoded');
  assert.equal(chooseSmaller({ originalSize: 100_000, encodedSize: 200_000, resized: false, originalAllowed: false }), 'encoded'); // formato no permitido: no hay original utilizable
});

test('el recorte de la foto de perfil es un cuadrado centrado', () => {
  assert.deepEqual(avatarCrop(4000, 3000), { sx: 500, sy: 0, side: 3000 });
  assert.deepEqual(avatarCrop(3000, 4000), { sx: 0, sy: 500, side: 3000 });
  assert.deepEqual(avatarCrop(800, 800), { sx: 0, sy: 0, side: 800 });
  assert.equal(AVATAR_SIDE, 512);
});
