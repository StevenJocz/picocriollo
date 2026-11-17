import assert from 'node:assert/strict';
import test from 'node:test';
import { rutaDeAviso } from '../src/features/notificaciones/rutas.ts';
import * as formato from '../src/features/social/formato.ts';
import { cifra, claveCorta, claveDeReel, etiquetasDe, hace, inicial } from '../src/features/social/formato.ts';

test('cada aviso lleva a la pantalla que corresponde', () => {
  assert.equal(rutaDeAviso('publicaciones', 'x'), '/mercado/mias');
  assert.equal(rutaDeAviso('compras-mercado', 'x'), '/mercado/operaciones');
  assert.equal(rutaDeAviso('mensajes', 'abc'), '/mercado/chat/abc');
  assert.equal(rutaDeAviso('mensajes'), '/mercado/mensajes');
  assert.equal(rutaDeAviso('facturas', 'FAC-1'), '/mercado/factura/FAC-1');
  assert.equal(rutaDeAviso('post', 'autor#post1'), '/reels/publicacion/post1');
  assert.equal(rutaDeAviso('post', 'autor'), '/perfil/autor');
  assert.equal(rutaDeAviso('mantenimiento'), '/agenda');
  // Lo que la app nueva no tiene todavía, o una vista desconocida, lleva al inicio.
  assert.equal(rutaDeAviso('nacimientos'), '/inicio');
  assert.equal(rutaDeAviso('vista-inventada', null), '/inicio');
});

test('el tiempo transcurrido se redondea hacia abajo', () => {
  const ahora = new Date('2026-10-26T12:00:00Z');
  assert.equal(hace('2026-10-26T11:59:40Z', ahora), 'ahora');
  assert.equal(hace('2026-10-26T11:55:00Z', ahora), 'hace 5 min');
  assert.equal(hace('2026-10-26T09:10:00Z', ahora), 'hace 2 h');
  assert.equal(hace('2026-10-24T12:00:00Z', ahora), 'hace 2 d');
  assert.match(hace('2026-09-01T12:00:00Z', ahora), /sep/);
  assert.equal(hace('no es fecha', ahora), '');
});

test('la inicial, las cifras y las etiquetas', () => {
  assert.equal(inicial('  ángela'), 'Á');
  assert.equal(inicial('@@@'), '?');
  assert.equal(inicial('3 Gallos'), '3');
  assert.equal(cifra(999), '999');
  assert.equal(cifra(1500), '1,5 mil');
  assert.equal(cifra(2_300_000), '2,3 M');
  assert.deepEqual(etiquetasDe('Mis #gallos y #Gallos criollos #patos_2'), ['gallos', 'Gallos', 'patos_2']);
});

test('las claves de «ya vistos» coinciden con las de la API', () => {
  const clave = claveDeReel('post', '3f2a9c1e-1111-2222-3333-444444444444');
  assert.equal(clave, 'p:3f2a9c1e-1111-2222-3333-444444444444');
  assert.equal(claveCorta(clave), 'p:3f2a9c1e');
  assert.equal(claveCorta(claveDeReel('advertisement', 'abcdef12-0000')), 'a:abcdef12');
});

test('la siguiente página se precarga antes de llegar al final del feed', () => {
  const fn = (formato as typeof formato & { debePrecargarSiguiente?: (indice: number, total: number) => boolean }).debePrecargarSiguiente;
  assert.equal(typeof fn, 'function');
  if (!fn) return;
  assert.equal(fn(2, 8), false);
  assert.equal(fn(3, 8), true);
  assert.equal(fn(7, 8), true);
  assert.equal(fn(0, 0), false);
});
