import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadMedia } from '../src/features/profile/service/media.ts';
import type { TranscodedVideo, VideoTranscoder } from '../src/features/profile/service/video-policy.ts';
import { ValidationError } from '../src/server/errors.ts';
import { createGate } from '../src/server/video-transcode.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, status } from './helpers/market.ts';

const pad = (head: number[], size: number) => { const bytes = new Uint8Array(size); bytes.set(head); return bytes; };
const MP4 = (size: number) => pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], size);
const WEBM = (size: number) => pad([0x1a, 0x45, 0xdf, 0xa3], size);
const JPEG = (size: number) => pad([0xff, 0xd8, 0xff, 0xe0], size);

const fake = (result: Partial<TranscodedVideo> & { size?: number }, calls: string[] = []): VideoTranscoder => ({
  async transcode(_bytes, mime) { calls.push(mime); return { bytes: MP4(result.size ?? 500), mime: 'video/mp4', width: 1280, height: 720, seconds: 20, ...result }; },
});

test('el video se guarda ya comprimido: se reemplazan los bytes, el tamaño y las medidas', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), calls: string[] = [];
    const deps = { store: env.store, media: env.media, transcoder: fake({ size: 400 }, calls) };
    const item = await uploadMedia(deps, ctx(env, ana), { bytes: MP4(5000), mime: 'video/mp4', purpose: 'post' });
    assert.equal(item.size, 400);
    assert.equal(item.mime, 'video/mp4');
    assert.equal(item.width, 1280); assert.equal(item.height, 720);
    assert.equal((await env.media.get(item.id))?.bytes.length, 400);
    assert.deepEqual(calls, ['video/mp4']);
  } finally { await env.cleanup(); }
});

test('un video WebM o MOV sale como MP4 (el formato que reproduce todo el mundo)', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const deps = { store: env.store, media: env.media, transcoder: fake({ size: 300 }) };
    const item = await uploadMedia(deps, ctx(env, ana), { bytes: WEBM(4000), mime: 'video/webm', purpose: 'post' });
    assert.equal(item.mime, 'video/mp4');
    assert.equal((await env.media.get(item.id))?.mime, 'video/mp4');
  } finally { await env.cleanup(); }
});

test('si el MP4 original ya es más liviano que el recomprimido, se conserva el original', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const deps = { store: env.store, media: env.media, transcoder: fake({ size: 900 }) };
    const item = await uploadMedia(deps, ctx(env, ana), { bytes: MP4(600), mime: 'video/mp4', purpose: 'post' });
    assert.equal(item.size, 600);
    assert.equal((await env.media.get(item.id))?.bytes.length, 600);
  } finally { await env.cleanup(); }
});

test('si el video no se puede procesar (muy largo, dañado) se rechaza y no queda nada guardado', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const failing: VideoTranscoder = { async transcode() { throw new ValidationError('El video dura 4 min y el máximo es 2 min.'); } };
    const deps = { store: env.store, media: env.media, transcoder: failing };
    await assert.rejects(uploadMedia(deps, ctx(env, ana), { bytes: MP4(5000), mime: 'video/mp4', purpose: 'post' }), error => (error as { status?: number }).status === 400 && /2 min/.test((error as Error).message));
    await env.store.tx(async tx => assert.equal((await tx.mediaItems.list()).length, 0));
  } finally { await env.cleanup(); }
});

test('las fotos y las miniaturas no pasan por el compresor de video', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), calls: string[] = [];
    const deps = { store: env.store, media: env.media, transcoder: fake({}, calls) };
    const photo = await uploadMedia(deps, ctx(env, ana), { bytes: JPEG(800), mime: 'image/jpeg', purpose: 'post' });
    await uploadMedia(deps, ctx(env, ana), { bytes: JPEG(100), mime: 'image/jpeg', purpose: 'post', thumbOf: photo.id });
    assert.deepEqual(calls, []);
  } finally { await env.cleanup(); }
});

test('sin compresor disponible el video se guarda tal cual (respaldo)', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const item = await uploadMedia({ store: env.store, media: env.media }, ctx(env, ana), { bytes: MP4(3000), mime: 'video/mp4', purpose: 'post' });
    assert.equal(item.size, 3000);
  } finally { await env.cleanup(); }
});

test('el compresor procesa un video a la vez y, si la fila es muy larga, avisa que está ocupado', async () => {
  const gate = createGate({ max: 1, maxWaitMs: 60 });
  const order: string[] = [];
  let release: () => void = () => undefined;
  const first = gate.run(async () => { order.push('a:start'); await new Promise<void>(resolve => { release = resolve; }); order.push('a:end'); return 'a'; });
  const waiting = gate.run(async () => { order.push('b:start'); return 'b'; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(order, ['a:start'], 'el segundo espera su turno');
  release();
  assert.equal(await first, 'a'); assert.equal(await waiting, 'b');
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start']);

  let free: () => void = () => undefined;
  const slow = gate.run(() => new Promise<void>(resolve => { free = resolve; }));
  await assert.rejects(gate.run(async () => 'x'), status(503));
  free(); await slow;
});
