import assert from 'node:assert/strict';
import test from 'node:test';
import { createPost, editPost, getPost, listPublicReels } from '../src/features/profile/service/posts.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const YT = 'https://youtu.be/dQw4w9WgXcQ';

test('una publicación puede ser solo un enlace de YouTube y se muestra como reproductor oficial', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana');
    const post = await createPost(deps(env), ctx(env, user), { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share' });
    assert.equal(post.text, '');
    assert.equal(post.media.length, 0);
    assert.deepEqual(post.embed, { provider: 'youtube', label: 'YouTube', id: 'dQw4w9WgXcQ', kind: 'watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1', aspect: 'landscape' });
    const again = await getPost(env.store, post.id, user);
    assert.equal(again.embed?.provider, 'youtube');
  } finally { await env.cleanup(); }
});

test('TikTok e Instagram ya no se pueden compartir en publicaciones: se explica que van en el perfil', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana');
    for (const url of ['https://www.tiktok.com/@criadero/video/7234567890123456789', 'https://www.instagram.com/reel/C8aBcDeFgHi/', 'https://vm.tiktok.com/ZMabc123/']) {
      await assert.rejects(createPost(deps(env), ctx(env, user), { videoUrl: url }), error => (error as { status?: number }).status === 400 && /solo.*YouTube/i.test((error as Error).message), url);
    }
    const plain = await createPost(deps(env), ctx(env, user), { text: 'Mira https://www.tiktok.com/@criadero/video/7234567890123456789' });
    assert.equal(plain.embed, undefined, 'un enlace de TikTok dentro del texto queda como texto');
  } finally { await env.cleanup(); }
});

test('si el texto trae un enlace compatible y no hay archivos, se usa como video', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana');
    const post = await createPost(deps(env), ctx(env, user), { text: `Mi gallo cantando ${YT} #gallos` });
    assert.equal(post.embed?.provider, 'youtube');
    assert.equal(post.embed?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1');
    assert.equal(post.embed?.aspect, 'landscape');
    const plain = await createPost(deps(env), ctx(env, user), { text: 'Sin enlaces, solo texto' });
    assert.equal(plain.embed, undefined);
    const other = await createPost(deps(env), ctx(env, user), { text: 'Mira https://example.com/video.mp4' });
    assert.equal(other.embed, undefined, 'dominios no compatibles se quedan como texto');
  } finally { await env.cleanup(); }
});

test('un enlace no compatible, dañino o sin permiso se rechaza con un mensaje claro', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana');
    for (const bad of ['https://example.com/video', 'javascript:alert(1)', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'texto cualquiera', 'https://vm.tiktok.com/ZMabc123/']) {
      await assert.rejects(createPost(deps(env), ctx(env, user), { videoUrl: bad }), status(400), bad);
    }
    await assert.rejects(createPost(deps(env), ctx(env, user), { videoUrl: 42 }), status(400));
  } finally { await env.cleanup(); }
});

test('un enlace explícito no se mezcla con archivos subidos', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana');
    await assert.rejects(createPost(deps(env), ctx(env, user), { videoUrl: YT, mediaIds: ['no-importa'] }), status(400));
  } finally { await env.cleanup(); }
});

test('un video ya guardado de otra plataforma se sigue mostrando, conserva el video al editar y se encuentra en los reels', async () => {
  const env = await makeEnv();
  try {
    const user = await env.addUser('Ana'), viewer = await env.addUser('Beto');
    const at = env.now.toISOString();
    await env.store.tx(tx => tx.posts.insert({ id: 'legacy-ig', authorId: user, text: 'Mis pollitos', mediaIds: [], createdAt: at, updatedAt: at, embed: { provider: 'instagram', id: 'C8aBcDeFgHi', kind: 'reel', url: 'https://www.instagram.com/reel/C8aBcDeFgHi/' } }));
    const edited = await editPost(deps(env), ctx(env, user), 'legacy-ig', 'Mis pollitos de hoy');
    assert.equal(edited.embed?.provider, 'instagram');
    const feed = await listPublicReels(env.store, {}, viewer);
    const item = feed.items.find(row => row.kind === 'post' && row.id === 'legacy-ig');
    assert.ok(item && item.kind === 'post' && item.post.embed?.embedUrl === 'https://www.instagram.com/reel/C8aBcDeFgHi/embed');
    for (const q of ['instagram', 'video', 'pollitos']) assert.equal((await listPublicReels(env.store, { q }, viewer)).items.some(row => row.id === 'legacy-ig'), true, q);
    assert.equal((await listPublicReels(env.store, { q: 'tiktok' }, viewer)).items.some(row => row.id === 'legacy-ig'), false);
  } finally { await env.cleanup(); }
});
