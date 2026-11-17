import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararCola } from '../src/features/social/colaPrecarga.ts';
import * as precarga from '../src/features/social/colaPrecarga.ts';

test('no publica pendientes y una foto fallida no bloquea las listas', async () => {
  const listos: number[] = [];
  let liberar!: () => void;
  const espera = new Promise<void>(r => { liberar = r; });
  const carga = prepararCola([1, 2, 3], async n => { if (n === 1) await espera; if (n === 2) throw Error('red'); }, n => listos.push(n), 2);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(listos, [3]);
  liberar();
  assert.deepEqual(await carga, [2]);
  assert.deepEqual(listos, [3, 1]);
});

test('calienta los primeros dos megabytes del video antes de publicar el reel', async () => {
  const calentarVideo = (precarga as unknown as { calentarVideo?: (url: string, solicitar?: typeof fetch) => Promise<void> }).calentarVideo;
  assert.equal(typeof calentarVideo, 'function');
  let rango = '';
  let consumido = false;
  const solicitar = (async (_entrada: RequestInfo | URL, opciones?: RequestInit) => {
    rango = new Headers(opciones?.headers).get('Range') ?? '';
    return { ok: true, status: 206, arrayBuffer: async () => { consumido = true; return new ArrayBuffer(4); } } as Response;
  }) as typeof fetch;
  await calentarVideo!('https://api.example/video-unico.mp4', solicitar);
  assert.equal(rango, 'bytes=0-2097151');
  assert.equal(consumido, true);
});

test('mantiene la portada sin indicador mientras el video termina de cargar', () => {
  const mostrarCargaVideo = (precarga as unknown as { mostrarCargaVideo?: (portada: string | null | undefined, estado: string) => boolean }).mostrarCargaVideo;
  assert.equal(typeof mostrarCargaVideo, 'function');
  assert.equal(mostrarCargaVideo!('/portada.webp', 'loading'), false);
  assert.equal(mostrarCargaVideo!(null, 'loading'), true);
  assert.equal(mostrarCargaVideo!(null, 'error'), false);
});
