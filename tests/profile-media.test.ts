import assert from 'node:assert/strict';
import test from 'node:test';
import { IMAGE_LIMIT_BYTES, USER_QUOTA_BYTES, VIDEO_LIMIT_BYTES, cleanOrphanMedia, setAvatar, sniffMime, uploadMedia } from '../src/features/profile/service/media.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const pad = (head: number[], size: number) => { const bytes = new Uint8Array(size); bytes.set(head); return bytes; };
export const JPEG = (size = 64) => pad([0xff, 0xd8, 0xff, 0xe0], size);
export const PNG = (size = 64) => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
export const WEBP = (size = 64) => pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], size);
export const MP4 = (size = 128) => pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], size);
const MOV = (size = 128) => pad([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20], size);
const WEBM = (size = 128) => pad([0x1a, 0x45, 0xdf, 0xa3], size);
const HEIC = (size = 128) => pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], size);

const up = (env: TestEnv, userId: string, bytes: Uint8Array, mime: string, extra: Record<string, unknown> = {}) =>
  uploadMedia(deps(env), ctx(env, userId), { bytes, mime, purpose: 'post', ...extra } as never);

test('el tipo real se detecta por los primeros bytes, no por lo que dice el cliente', () => {
  assert.equal(sniffMime(JPEG()), 'image/jpeg');
  assert.equal(sniffMime(PNG()), 'image/png');
  assert.equal(sniffMime(WEBP()), 'image/webp');
  assert.equal(sniffMime(MP4()), 'video/mp4');
  assert.equal(sniffMime(MOV()), 'video/quicktime');
  assert.equal(sniffMime(WEBM()), 'video/webm');
  for (const bad of [new Uint8Array(0), new Uint8Array([1, 2, 3]), HEIC(), new TextEncoder().encode('<script>alert(1)</script>'), new TextEncoder().encode('%PDF-1.4'), new TextEncoder().encode('GIF89a......')]) assert.equal(sniffMime(bad), null);
});

test('sube fotos y videos válidos, los guarda y devuelve el registro', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const photo = await up(env, ana, WEBP(500), 'image/webp', { width: 1600, height: 900 });
    assert.deepEqual({ kind: photo.kind, mime: photo.mime, size: photo.size, purpose: photo.purpose, width: photo.width, height: photo.height }, { kind: 'image', mime: 'image/webp', size: 500, purpose: 'post', width: 1600, height: 900 });
    const video = await up(env, ana, MP4(2048), 'video/mp4');
    assert.equal(video.kind, 'video');
    const stored = await env.media.get(video.id);
    assert.equal(stored?.mime, 'video/mp4'); assert.equal(stored?.bytes.length, 2048);
  } finally { await env.cleanup(); }
});

test('rechaza archivos falsos, vacíos, de tipo no permitido o demasiado grandes', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await assert.rejects(up(env, ana, new Uint8Array(0), 'image/jpeg'), status(400));
    await assert.rejects(up(env, ana, new TextEncoder().encode('<html>no soy una foto</html>'), 'image/jpeg'), status(400)); // HTML disfrazado
    await assert.rejects(up(env, ana, PNG(), 'image/jpeg'), status(400)); // dice jpeg, es png
    await assert.rejects(up(env, ana, HEIC(), 'image/heic'), status(400));
    await assert.rejects(up(env, ana, JPEG(), 'application/pdf'), status(400));
    await assert.rejects(up(env, ana, JPEG(IMAGE_LIMIT_BYTES + 1), 'image/jpeg'), status(413));
    await assert.rejects(up(env, ana, MP4(VIDEO_LIMIT_BYTES + 1), 'video/mp4'), status(413));
    await assert.rejects(up(env, ana, JPEG(), 'image/jpeg', { width: -5 }), status(400));
    await assert.rejects(up(env, ana, JPEG(), 'image/jpeg', { height: 99999 }), status(400));
    await env.store.tx(async tx => assert.equal((await tx.mediaItems.list()).length, 0));
  } finally { await env.cleanup(); }
});

test('el límite de almacenamiento por usuario se respeta y se libera al borrar', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    assert.ok(USER_QUOTA_BYTES >= 100 * 1024 * 1024);
    // Se simula uso previo para no escribir gigabytes en la prueba.
    await env.store.tx(async tx => tx.mediaItems.insert({ id: 'previo', ownerId: ana, kind: 'video', mime: 'video/mp4', size: USER_QUOTA_BYTES - 100, purpose: 'post', createdAt: env.now.toISOString() }));
    await assert.rejects(up(env, ana, JPEG(200), 'image/jpeg'), status(409));
    await up(env, ana, JPEG(100), 'image/jpeg');
  } finally { await env.cleanup(); }
});

test('hay un límite de subidas por hora', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    for (let i = 0; i < 120; i++) await up(env, ana, JPEG(10), 'image/jpeg');
    await assert.rejects(up(env, ana, JPEG(10), 'image/jpeg'), status(409));
  } finally { await env.cleanup(); }
});

test('la miniatura va ligada a un archivo propio, es imagen y no se repite', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const full = await up(env, ana, JPEG(5000), 'image/jpeg');
    const thumb = await up(env, ana, WEBP(300), 'image/webp', { thumbOf: full.id });
    assert.equal(thumb.purpose, 'thumb'); assert.equal(thumb.thumbOf, full.id);
    await assert.rejects(up(env, ana, WEBP(300), 'image/webp', { thumbOf: full.id }), status(409)); // ya tiene
    await assert.rejects(up(env, beto, WEBP(300), 'image/webp', { thumbOf: full.id }), status(403)); // ajeno
    await assert.rejects(up(env, ana, WEBP(300), 'image/webp', { thumbOf: 'no-existe' }), status(404));
    await assert.rejects(up(env, ana, MP4(300), 'video/mp4', { thumbOf: full.id }), status(400)); // la miniatura es imagen
    const clip = await up(env, ana, MP4(300), 'video/mp4');
    await up(env, ana, JPEG(300), 'image/jpeg', { thumbOf: clip.id }); // póster de un video
  } finally { await env.cleanup(); }
});

test('foto de perfil: solo imágenes pequeñas, se reemplaza borrando la anterior y solo la propia', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const avatar = (userId: string, bytes: Uint8Array, mime: string) => uploadMedia(deps(env), ctx(env, userId), { bytes, mime, purpose: 'avatar' });
    await assert.rejects(avatar(ana, MP4(), 'video/mp4'), status(400));
    await assert.rejects(avatar(ana, JPEG(3 * 1024 * 1024 + 1), 'image/jpeg'), status(413));
    const one = await avatar(ana, WEBP(400), 'image/webp'), two = await avatar(ana, WEBP(500), 'image/webp');
    assert.equal((await setAvatar(deps(env), ctx(env, ana), one.id)).avatarUrl, `/api/media/${one.id}`);
    await assert.rejects(setAvatar(deps(env), ctx(env, beto), two.id), status(403)); // ajena
    const post = await up(env, ana, JPEG(), 'image/jpeg');
    await assert.rejects(setAvatar(deps(env), ctx(env, ana), post.id), status(400)); // no es de tipo avatar
    await setAvatar(deps(env), ctx(env, ana), two.id);
    assert.equal(await env.media.get(one.id), undefined); // la anterior se borró
    assert.ok(await env.media.get(two.id));
    await env.store.tx(async tx => { assert.equal(await tx.mediaItems.get(one.id), undefined); assert.equal((await tx.users.get(ana))!.avatarId, two.id); });
    const cleared = await setAvatar(deps(env), ctx(env, ana), null);
    assert.equal(cleared.avatarUrl, null);
    assert.equal(await env.media.get(two.id), undefined);
  } finally { await env.cleanup(); }
});

test('los archivos subidos y nunca usados se limpian pasado un día; los usados no', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const stale = await up(env, ana, JPEG(), 'image/jpeg');
    const staleThumb = await up(env, ana, WEBP(), 'image/webp', { thumbOf: stale.id });
    const kept = await up(env, ana, JPEG(), 'image/jpeg');
    await env.store.tx(async tx => { await tx.mediaItems.update({ ...(await tx.mediaItems.get(kept.id))!, postId: 'una-publicacion' }); });
    assert.equal((await cleanOrphanMedia(deps(env), new Date(env.now.getTime() + 3_600_000))).removed, 0); // aún es reciente
    const result = await cleanOrphanMedia(deps(env), new Date(env.now.getTime() + 25 * 3_600_000));
    assert.equal(result.removed, 2);
    assert.equal(await env.media.get(stale.id), undefined); assert.equal(await env.media.get(staleThumb.id), undefined);
    assert.ok(await env.media.get(kept.id));
  } finally { await env.cleanup(); }
});
