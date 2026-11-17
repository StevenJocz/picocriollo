import assert from 'node:assert/strict';
import test from 'node:test';
import { createPost, deletePost, getPost, listPosts, listPublicReels, sharePost } from '../src/features/profile/service/posts.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, flush, notes, status } from './helpers/market.ts';

const YT = 'https://youtu.be/dQw4w9WgXcQ';

test('compartir un reel crea una publicación propia que apunta al original y muestra su contenido', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Mi gallo Brahma #gallos', videoUrl: YT });
    const shared = await sharePost(deps(env), ctx(env, beto), original.id, 'Qué belleza de ejemplar');
    assert.equal(shared.authorId, beto);
    assert.equal(shared.text, 'Qué belleza de ejemplar');
    assert.equal(shared.shared?.available, true);
    assert.equal(shared.shared?.id, original.id);
    assert.equal(shared.shared?.authorId, ana);
    assert.equal(shared.shared?.text, 'Mi gallo Brahma #gallos');
    assert.equal(shared.shared?.embed?.provider, 'youtube');
    assert.equal(shared.embed, undefined, 'el video vive en el original, no se copia');
    const wall = await listPosts(env.store, beto, {}, beto);
    assert.equal(wall.items[0]?.shared?.id, original.id);
  } finally { await env.cleanup(); }
});

test('el comentario es opcional y no hay que compartir lo propio ni dos veces lo mismo', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Pollitos recién nacidos' });
    const plain = await sharePost(deps(env), ctx(env, beto), original.id, undefined);
    assert.equal(plain.text, '');
    await assert.rejects(sharePost(deps(env), ctx(env, beto), original.id, 'otra vez'), status(409));
    await assert.rejects(sharePost(deps(env), ctx(env, ana), original.id, ''), status(400));
    await assert.rejects(sharePost(deps(env), ctx(env, beto), 'no-existe', ''), status(404));
  } finally { await env.cleanup(); }
});

test('compartir un repost comparte el original (nunca cadenas) y el comentario no admite contactos', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Gallina ponedora' });
    const first = await sharePost(deps(env), ctx(env, beto), original.id, 'mira');
    const second = await sharePost(deps(env), ctx(env, carla), first.id, 'yo también');
    assert.equal(second.shared?.id, original.id);
    await assert.rejects(sharePost(deps(env), ctx(env, carla), original.id, ''), status(409));
    const dana = await env.addUser('Dana');
    await assert.rejects(sharePost(deps(env), ctx(env, dana), original.id, 'escríbeme al 3001234567'), status(400));
  } finally { await env.cleanup(); }
});

test('el autor original recibe un aviso al ser compartido y no uno por compartir lo ajeno de nuevo', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Mi criadero' });
    await sharePost(deps(env), ctx(env, beto), original.id, 'recomendado');
    await flush(env);
    const list = await notes(env, ana, 'profile.post.shared');
    assert.equal(list.length, 1);
    assert.match(list[0].title, /Beto/);
  } finally { await env.cleanup(); }
});

test('si el original se borra o se oculta, el repost lo indica y deja de salir en los reels', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Aviso temporal' });
    const shared = await sharePost(deps(env), ctx(env, beto), original.id, 'guardado');
    assert.equal((await listPublicReels(env.store, {}, beto)).items.filter(item => item.kind === 'post').length, 2);
    await env.store.tx(async tx => { const row = await tx.posts.get(original.id); await tx.posts.update({ ...row!, hiddenAt: env.now.toISOString(), hiddenBy: 'mod' }); });
    const reels = (await listPublicReels(env.store, {}, beto)).items.filter(item => item.kind === 'post');
    assert.deepEqual(reels.map(item => item.id), [], 'ni el original oculto ni su repost salen en el feed');
    const view = await getPost(env.store, shared.id, beto);
    assert.equal(view.shared?.available, false);
    assert.equal(view.shared?.text, undefined);
    await env.store.tx(async tx => { const row = await tx.posts.get(original.id); await tx.posts.update({ ...row!, hiddenAt: undefined, hiddenBy: undefined }); });
    await deletePost(deps(env), ctx(env, ana), original.id);
    assert.equal((await getPost(env.store, shared.id, beto)).shared?.available, false);
  } finally { await env.cleanup(); }
});

test('el repost es una publicación normal: se puede borrar y no borra el original', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const original = await createPost(deps(env), ctx(env, ana), { text: 'Para compartir' });
    const shared = await sharePost(deps(env), ctx(env, beto), original.id, '');
    await deletePost(deps(env), ctx(env, beto), shared.id);
    assert.equal((await getPost(env.store, original.id, ana)).text, 'Para compartir');
    await sharePost(deps(env), ctx(env, beto), original.id, 'otra vez, ya se puede');
  } finally { await env.cleanup(); }
});
