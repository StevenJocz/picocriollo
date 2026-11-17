import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el video local se reproduce dentro del reel en Safari del iPhone', () => {
  const fuente = leer('../src/features/social/VideoLocal.tsx');
  assert.match(fuente, /playsInline/);
  assert.match(fuente, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.match(fuente, /allowsPictureInPicture=\{false\}/);
});

test('los videos se detienen cuando la pantalla de reels pierde el foco', () => {
  const fuente = leer('../src/app/(app)/reels/index.tsx');
  assert.match(fuente, /useFocusEffect/);
  assert.match(fuente, /enFoco && activo === item\.id/);
});

test('el reproductor intenta audio y conserva una salida para el bloqueo de autoplay', () => {
  const fuente = leer('../src/features/social/VideoLocal.tsx');
  assert.match(fuente, /activarSonido/);
  assert.match(fuente, /iniciarReproduccion/);
  assert.match(fuente, /player\.muted = false/);
  assert.match(fuente, /if \(!player\.playing\)/);
  assert.match(fuente, /player\.muted = true/);
  assert.match(fuente, /player\.muted = true;\s*player\.pause\(\)/);
});

test('el video se ve completo y rellena el reel con su portada desenfocada', () => {
  const fuente = leer('../src/features/social/VideoLocal.tsx');
  assert.match(fuente, /resizeMode="cover"/);
  assert.match(fuente, /blurRadius=\{24\}/);
  assert.match(fuente, /contentFit="contain"/);
});

test('Explorar vive como botón más en la barra inferior de reels', () => {
  const barra = leer('../src/components/BarraPrincipal.tsx');
  const reels = leer('../src/app/(app)/reels/index.tsx');
  assert.match(barra, /accessibilityLabel="Explorar reels"/);
  assert.match(barra, /<Plus/);
  assert.match(barra, /explorar: String\(Date\.now\(\)\)/);
  assert.doesNotMatch(reels, />Explorar<\/Texto>/);
  assert.match(reels, /if \(explorar\) setEncabezado\(true\)/);
});
