import assert from 'node:assert/strict';
import test from 'node:test';
import { createPost, deletePost, editPost, listPosts, MAX_MEDIA_PER_POST, MAX_TEXT } from '../src/features/profile/service/posts.ts';
import { setAvatar, uploadMedia } from '../src/features/profile/service/media.ts';
import { createReport, listReports, resolveReport } from '../src/features/market/service/moderation.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { at, ctx, deps, HOUR, status } from './helpers/market.ts';

const pad = (head: number[], size: number) => { const bytes = new Uint8Array(size); bytes.set(head); return bytes; };
const JPEG = (size = 64) => pad([0xff, 0xd8, 0xff, 0xe0], size);
const WEBP = (size = 64) => pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], size);
const MP4 = (size = 128) => pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], size);

const photo = (env: TestEnv, userId: string, size = 200) => uploadMedia(deps(env), ctx(env, userId), { bytes: JPEG(size), mime: 'image/jpeg', purpose: 'post', width: 800, height: 600 });
const post = (env: TestEnv, userId: string, input: { text?: unknown; mediaIds?: unknown }, now?: Date) => createPost(deps(env), ctx(env, userId, now), input);

test('publica solo texto, solo fotos o ambos; vacío no se permite', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    const text = await post(env, ana, { text: '  Hoy nacieron 8 pollitos 🐣  ' });
    assert.equal(text.text, 'Hoy nacieron 8 pollitos 🐣'); assert.equal(text.media.length, 0); assert.equal(text.authorAlias, 'Ana');
    const p1 = await photo(env, ana), p2 = await photo(env, ana);
    const only = await post(env, ana, { mediaIds: [p1.id, p2.id] });
    assert.deepEqual(only.media.map(m => m.id), [p1.id, p2.id]); // conserva el orden
    assert.equal(only.media[0].url, `/api/media/${p1.id}`); assert.equal(only.media[0].width, 800);
    for (const empty of [{}, { text: '' }, { text: '   ' }, { text: '\n\n', mediaIds: [] }]) await assert.rejects(post(env, ana, empty), status(400));
  } finally { await env.cleanup(); }
});

test('valida el texto: tamaño, caracteres de control y teléfonos o correos', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await post(env, ana, { text: 'x'.repeat(MAX_TEXT) });
    await assert.rejects(post(env, ana, { text: 'x'.repeat(MAX_TEXT + 1) }), status(400));
    await assert.rejects(post(env, ana, { text: 123 }), status(400));
    await assert.rejects(post(env, ana, { text: 'hola\u0000mundo' }), status(400));
    await assert.rejects(post(env, ana, { text: 'Escríbeme al 300 123 4567' }), status(400));
    await assert.rejects(post(env, ana, { text: 'mi correo es ana@correo.com' }), status(400));
    for (const fine of ['Nació el 2026-10-14 a las 15:00', 'Vendo gallos a $1.200.000 negociables', 'Pesa 1200000 gramos', 'Lote 12345 y 678']) await post(env, ana, { text: fine });
    for (const phone of ['+57 300 123 4567', 'al 3001234567', '300-123-4567', 'llama 604 123 4567 hoy']) await assert.rejects(post(env, ana, { text: phone }), status(400), phone);
    const ok = await post(env, ana, { text: 'Primera línea\nSegunda línea\tcon tab' });
    assert.equal(ok.text, 'Primera línea\nSegunda línea\tcon tab');
  } finally { await env.cleanup(); }
});

test('solo se pueden adjuntar archivos propios, de publicación, sin usar y hasta el máximo', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const mine = await photo(env, ana), theirs = await photo(env, beto);
    await assert.rejects(post(env, ana, { mediaIds: [theirs.id] }), status(403));
    await assert.rejects(post(env, ana, { mediaIds: ['no-existe'] }), status(404));
    await assert.rejects(post(env, ana, { mediaIds: [mine.id, mine.id] }), status(400)); // repetido
    await assert.rejects(post(env, ana, { mediaIds: 'x' }), status(400));
    await assert.rejects(post(env, ana, { mediaIds: [42] }), status(400));
    const avatar = await uploadMedia(deps(env), ctx(env, ana), { bytes: WEBP(), mime: 'image/webp', purpose: 'avatar' });
    await assert.rejects(post(env, ana, { mediaIds: [avatar.id] }), status(400)); // la foto de perfil no es de publicación
    const thumb = await uploadMedia(deps(env), ctx(env, ana), { bytes: WEBP(), mime: 'image/webp', purpose: 'post', thumbOf: mine.id });
    await assert.rejects(post(env, ana, { mediaIds: [thumb.id] }), status(400)); // una miniatura no se adjunta sola
    const first = await post(env, ana, { text: 'con foto', mediaIds: [mine.id] });
    assert.equal(first.media.length, 1);
    assert.equal(first.media[0].thumbUrl, `/api/media/${thumb.id}`);
    await assert.rejects(post(env, ana, { mediaIds: [mine.id] }), status(409)); // ya está en otra publicación
    const many = [];
    for (let i = 0; i < MAX_MEDIA_PER_POST + 1; i++) many.push((await photo(env, ana)).id);
    await assert.rejects(post(env, ana, { mediaIds: many }), status(400));
    await post(env, ana, { mediaIds: many.slice(0, MAX_MEDIA_PER_POST) });
  } finally { await env.cleanup(); }
});

test('una cuenta con restricciones no publica y hay un límite diario', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto', { suspendedAt: env.now.toISOString(), suspendedReason: 'prueba' });
    await assert.rejects(post(env, beto, { text: 'hola' }), status(403));
    for (let i = 0; i < 30; i++) await post(env, ana, { text: `publicación ${i}` });
    await assert.rejects(post(env, ana, { text: 'una más' }), status(409));
    await post(env, ana, { text: 'otro día' }, at(env, 25 * HOUR));
  } finally { await env.cleanup(); }
});

test('el muro es público, va de la más nueva a la más vieja y se pagina', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    for (let i = 1; i <= 25; i++) await post(env, ana, { text: `nota ${i}` }, at(env, i * 60_000));
    const first = await listPosts(env.store, ana, { limit: 10 });
    assert.equal(first.items.length, 10); assert.equal(first.items[0].text, 'nota 25'); assert.equal(first.items[9].text, 'nota 16');
    assert.ok(first.nextBefore);
    const second = await listPosts(env.store, ana, { limit: 10, before: first.nextBefore });
    assert.equal(second.items[0].text, 'nota 15');
    const third = await listPosts(env.store, ana, { limit: 10, before: second.nextBefore });
    assert.equal(third.items.length, 5); assert.equal(third.nextBefore, undefined);
    const all = [...first.items, ...second.items, ...third.items].map(item => item.id);
    assert.equal(new Set(all).size, 25); // sin repetidos ni saltos
    assert.equal((await listPosts(env.store, ana, { limit: 9999 })).items.length, 25 > 30 ? 30 : 25);
    assert.equal((await listPosts(env.store, ana, {})).items.length, 10); // por defecto 10
    await assert.rejects(listPosts(env.store, 'no-existe', {}), status(404));
  } finally { await env.cleanup(); }
});

test('cada publicación muestra a su autor con foto de perfil y si es mía', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const avatar = await uploadMedia(deps(env), ctx(env, ana), { bytes: WEBP(), mime: 'image/webp', purpose: 'avatar' });
    await setAvatar(deps(env), ctx(env, ana), avatar.id);
    await post(env, ana, { text: 'hola' });
    const asOwner = (await listPosts(env.store, ana, {}, ana)).items[0], asVisitor = (await listPosts(env.store, ana, {}, beto)).items[0], asAnon = (await listPosts(env.store, ana, {})).items[0];
    assert.deepEqual([asOwner.mine, asVisitor.mine, asAnon.mine], [true, false, false]);
    assert.equal(asVisitor.authorAvatarUrl, `/api/media/${avatar.id}`);
    assert.ok(!JSON.stringify(asAnon).includes('@correo.test')); assert.ok(!JSON.stringify(asAnon).includes('secreto-hash'));
  } finally { await env.cleanup(); }
});

test('editar: solo el autor, mantiene fotos y marca «editada»; no se puede dejar vacía', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const p = await photo(env, ana);
    const created = await post(env, ana, { text: 'original', mediaIds: [p.id] });
    await assert.rejects(editPost(deps(env), ctx(env, beto), created.id, 'hackeada'), status(403));
    await assert.rejects(editPost(deps(env), ctx(env, ana), 'no-existe', 'x'), status(404));
    await assert.rejects(editPost(deps(env), ctx(env, ana), created.id, 'Llámame al 3001234567'), status(400));
    const edited = await editPost(deps(env), ctx(env, ana, at(env, HOUR)), created.id, 'corregido');
    assert.equal(edited.text, 'corregido'); assert.ok(edited.editedAt); assert.equal(edited.media.length, 1);
    const textOnly = await post(env, ana, { text: 'solo texto' });
    await assert.rejects(editPost(deps(env), ctx(env, ana), textOnly.id, '  '), status(400));
    const cleared = await editPost(deps(env), ctx(env, ana), created.id, ''); // con foto, el texto puede quedar vacío
    assert.equal(cleared.text, '');
  } finally { await env.cleanup(); }
});

test('borrar: solo el autor; se borran los archivos y la publicación desaparece', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const p = await photo(env, ana);
    const t = await uploadMedia(deps(env), ctx(env, ana), { bytes: WEBP(), mime: 'image/webp', purpose: 'post', thumbOf: p.id });
    const created = await post(env, ana, { mediaIds: [p.id] });
    await assert.rejects(deletePost(deps(env), ctx(env, beto), created.id), status(403));
    await deletePost(deps(env), ctx(env, ana), created.id);
    assert.equal((await listPosts(env.store, ana, {})).items.length, 0);
    assert.equal(await env.media.get(p.id), undefined); assert.equal(await env.media.get(t.id), undefined);
    await env.store.tx(async tx => { assert.equal((await tx.mediaItems.list({ ownerId: ana })).length, 0); assert.equal(await tx.posts.get(created.id), undefined); });
    await assert.rejects(deletePost(deps(env), ctx(env, ana), created.id), status(404));
  } finally { await env.cleanup(); }
});

test('denunciar una publicación: la oculta un moderador; el autor la ve marcada y los demás no', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto'), mod = await env.addUser('Moderadora', { role: 'moderator' });
    const created = await post(env, ana, { text: 'contenido dudoso' });
    await assert.rejects(createReport(env.store, ctx(env, ana), { targetType: 'post', targetId: created.id, reason: 'es mía y la denuncio' }), status(403));
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'post', targetId: 'no-existe', reason: 'motivo suficientemente largo' }), status(404));
    const report = await createReport(env.store, ctx(env, beto), { targetType: 'post', targetId: created.id, reason: 'contenido inapropiado en la publicación' });
    const view = (await listReports(env.store, mod)).find(row => row.id === report.id)!;
    assert.match(view.target, /contenido dudoso/);
    await assert.rejects(resolveReport(env.store, ctx(env, mod), report.id, { action: 'suspend', note: 'acción que no aplica' }), status(400));
    await resolveReport(env.store, ctx(env, mod), report.id, { action: 'hide', note: 'Se oculta por incumplir las normas' });
    assert.equal((await listPosts(env.store, ana, {}, beto)).items.length, 0);
    assert.equal((await listPosts(env.store, ana, {})).items.length, 0);
    const own = (await listPosts(env.store, ana, {}, ana)).items;
    assert.equal(own.length, 1); assert.equal(own[0].hidden, true);
    await assert.rejects(editPost(deps(env), ctx(env, ana), created.id, 'intento de revivirla'), status(403)); // oculta por moderación: no se edita
  } finally { await env.cleanup(); }
});
