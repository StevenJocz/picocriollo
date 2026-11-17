import assert from 'node:assert/strict';
import test from 'node:test';
import { addComment, deleteComment, editComment, listComments, listLikers, listReplies, setLike } from '../src/features/profile/service/social.ts';
import { createPost, deletePost, getPost, listPosts } from '../src/features/profile/service/posts.ts';
import { createReport, resolveReport } from '../src/features/market/service/moderation.ts';
import { makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { at, ctx, deps, HOUR, notes, status } from './helpers/market.ts';

async function world() {
  const env = await makeEnv();
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto'), carla = await env.addUser('Carla'), mod = await env.addUser('Moderadora', { role: 'moderator' });
  const post = await createPost(deps(env), ctx(env, ana), { text: 'Hoy nacieron 8 pollitos' });
  return { env, ana, beto, carla, mod, post };
}
const comment = (env: TestEnv, userId: string, postId: string, text: unknown, parentId?: string, now?: Date) => addComment(env.store, ctx(env, userId, now), postId, { text, parentId });
const like = (env: TestEnv, userId: string, postId: string, liked: boolean) => setLike(env.store, ctx(env, userId), postId, liked);

// ---------------- Me gusta ----------------

test('me gusta: una vez por persona, se puede quitar y el contador es exacto', async () => {
  const { env, ana, beto, carla, post } = await world();
  try {
    assert.deepEqual(await like(env, beto, post.id, true), { liked: true, likes: 1 });
    assert.deepEqual(await like(env, beto, post.id, true), { liked: true, likes: 1 }); // doble clic: no duplica
    assert.deepEqual(await like(env, carla, post.id, true), { liked: true, likes: 2 });
    assert.deepEqual(await like(env, ana, post.id, true), { liked: true, likes: 3 }); // también el autor
    assert.deepEqual(await like(env, beto, post.id, false), { liked: false, likes: 2 });
    assert.deepEqual(await like(env, beto, post.id, false), { liked: false, likes: 2 }); // quitar dos veces no falla ni resta de más
    const asBeto = (await listPosts(env.store, ana, {}, beto)).items[0], asCarla = (await listPosts(env.store, ana, {}, carla)).items[0], anon = (await listPosts(env.store, ana, {})).items[0];
    assert.deepEqual([asBeto.likes, asBeto.liked, asCarla.liked, anon.likes, anon.liked], [2, false, true, 2, false]);
    const likers = await listLikers(env.store, post.id);
    assert.equal(likers.total, 2); assert.deepEqual(likers.users.map(user => user.alias).sort(), ['Ana', 'Carla']);
    assert.ok(!JSON.stringify(likers).includes('@correo.test'));
  } finally { await env.cleanup(); }
});

test('me gusta: publicación inexistente u oculta da 404 y una cuenta con restricciones no puede', async () => {
  const { env, ana, beto, mod, post } = await world();
  try {
    await assert.rejects(like(env, beto, 'no-existe', true), status(404));
    await assert.rejects(listLikers(env.store, 'no-existe'), status(404));
    const limited = await env.addUser('Limitado', { suspendedAt: env.now.toISOString(), suspendedReason: 'prueba' });
    await assert.rejects(like(env, limited, post.id, true), status(403));
    const report = await createReport(env.store, ctx(env, beto), { targetType: 'post', targetId: post.id, reason: 'contenido inapropiado en la publicación' });
    await resolveReport(env.store, ctx(env, mod), report.id, { action: 'hide', note: 'Se oculta por incumplir las normas' });
    await assert.rejects(like(env, beto, post.id, true), status(404));
    await assert.rejects(comment(env, beto, post.id, 'hola'), status(404));
    void ana;
  } finally { await env.cleanup(); }
});

test('me gusta avisa una sola vez al autor, aunque se quite y se ponga; no avisa del propio', async () => {
  const { env, ana, beto, carla, post } = await world();
  try {
    await like(env, beto, post.id, true); await like(env, beto, post.id, false); await like(env, beto, post.id, true);
    await like(env, carla, post.id, true);
    await like(env, ana, post.id, true);
    const list = await notes(env, ana, 'profile.post.liked');
    assert.equal(list.length, 2);
    assert.ok(list.some(n => /Beto/.test(n.title))); assert.ok(list.every(n => n.link.view === 'post' && n.link.id === `${ana}#${post.id}`));
    assert.equal((await notes(env, beto, 'profile.post.liked')).length, 0);
  } finally { await env.cleanup(); }
});

// ---------------- Comentarios ----------------

test('comentar: texto válido, orden de más viejo a más nuevo y contador de la publicación', async () => {
  const { env, beto, carla, post } = await world();
  try {
    const first = await comment(env, beto, post.id, '  ¡Qué buena noticia!  ', undefined, at(env, 1000));
    const second = await comment(env, carla, post.id, 'Felicitaciones 🐣', undefined, at(env, 2000));
    assert.equal(first.text, '¡Qué buena noticia!'); assert.equal(first.mine, true); assert.equal(first.authorAlias, 'Beto');
    const page = await listComments(env.store, post.id, {}, beto);
    assert.deepEqual(page.items.map(c => c.text), ['¡Qué buena noticia!', 'Felicitaciones 🐣']);
    assert.equal(page.items[1].mine, false);
    assert.equal((await listPosts(env.store, post.authorId, {})).items[0].commentCount, 2);
    assert.equal((await getPost(env.store, post.id)).commentCount, 2);
    void second;
  } finally { await env.cleanup(); }
});

test('comentar: valida texto (vacío, largo, control, contacto) y cuenta con restricciones', async () => {
  const { env, beto, post } = await world();
  try {
    for (const bad of [undefined, null, 5, '', '   ', 'x'.repeat(1001), 'hola\u0000', 'llámame al 3001234567', 'escríbeme a beto@correo.com']) await assert.rejects(comment(env, beto, post.id, bad), status(400), JSON.stringify(bad));
    await comment(env, beto, post.id, 'x'.repeat(1000));
    const limited = await env.addUser('Limitado', { suspendedAt: env.now.toISOString(), suspendedReason: 'prueba' });
    await assert.rejects(comment(env, limited, post.id, 'hola'), status(403));
  } finally { await env.cleanup(); }
});

test('hilos: dos niveles; responder a una respuesta se une al comentario principal y nombra a quién respondes', async () => {
  const { env, ana, beto, carla, post } = await world();
  try {
    const root = await comment(env, beto, post.id, 'Principal', undefined, at(env, 1000));
    const r1 = await comment(env, carla, post.id, 'Respuesta de Carla', root.id, at(env, 2000));
    assert.equal(r1.parentId, root.id); assert.equal(r1.replyTo?.alias, 'Beto');
    const r2 = await comment(env, ana, post.id, 'Y yo a Carla', r1.id, at(env, 3000)); // responde a una respuesta
    assert.equal(r2.parentId, root.id); // no hay un tercer nivel
    assert.equal(r2.replyTo?.alias, 'Carla');
    const page = await listComments(env.store, post.id, {}, ana);
    assert.equal(page.items.length, 1); assert.equal(page.items[0].repliesTotal, 2);
    assert.deepEqual(page.items[0].replies?.map(c => c.text), ['Respuesta de Carla', 'Y yo a Carla']);
    assert.equal((await getPost(env.store, post.id)).commentCount, 3); // cuenta comentarios y respuestas
    // el comentario principal de otra publicación no sirve como padre
    const other = await createPost(deps(env), ctx(env, ana), { text: 'otra publicación' });
    await assert.rejects(comment(env, beto, other.id, 'cruzado', root.id), status(400));
    await assert.rejects(comment(env, beto, post.id, 'huérfano', 'no-existe'), status(404));
  } finally { await env.cleanup(); }
});

test('hilos: la vista previa trae 2 respuestas y listReplies trae todas en orden', async () => {
  const { env, ana, beto, post } = await world();
  try {
    const root = await comment(env, beto, post.id, 'Principal', undefined, at(env, 1000));
    for (let i = 1; i <= 5; i++) await comment(env, ana, post.id, `respuesta ${i}`, root.id, at(env, 2000 + i));
    const page = await listComments(env.store, post.id, {}, ana);
    assert.equal(page.items[0].repliesTotal, 5); assert.equal(page.items[0].replies?.length, 2);
    assert.deepEqual((await listReplies(env.store, root.id, ana)).map(c => c.text), ['respuesta 1', 'respuesta 2', 'respuesta 3', 'respuesta 4', 'respuesta 5']);
    await assert.rejects(listReplies(env.store, 'no-existe', ana), status(404));
    await assert.rejects(listReplies(env.store, (await listReplies(env.store, root.id, ana))[0].id, ana), status(404)); // una respuesta no tiene respuestas propias
  } finally { await env.cleanup(); }
});

test('comentarios principales: paginación de 10 en 10 sin repetir ni saltar', async () => {
  const { env, beto, post } = await world();
  try {
    for (let i = 1; i <= 23; i++) await comment(env, beto, post.id, `c${i}`, undefined, at(env, i * 1000));
    const p1 = await listComments(env.store, post.id, { limit: 10 }, beto);
    assert.equal(p1.items.length, 10); assert.equal(p1.items[0].text, 'c1'); assert.ok(p1.nextAfter); assert.equal(p1.total, 23);
    const p2 = await listComments(env.store, post.id, { limit: 10, after: p1.nextAfter }, beto);
    const p3 = await listComments(env.store, post.id, { limit: 10, after: p2.nextAfter }, beto);
    assert.equal(p3.items.length, 3); assert.equal(p3.nextAfter, undefined);
    assert.deepEqual([...p1.items, ...p2.items, ...p3.items].map(c => c.text), Array.from({ length: 23 }, (_, i) => `c${i + 1}`));
    assert.equal((await listComments(env.store, post.id, { limit: 9999 }, beto)).items.length, 23 > 30 ? 30 : 23);
  } finally { await env.cleanup(); }
});

test('editar un comentario: solo el autor, marca «editado» y respeta las reglas del texto', async () => {
  const { env, ana, beto, post } = await world();
  try {
    const c = await comment(env, beto, post.id, 'original');
    await assert.rejects(editComment(env.store, ctx(env, ana), c.id, 'la dueña no puede editar lo ajeno'), status(403));
    await assert.rejects(editComment(env.store, ctx(env, beto), c.id, ''), status(400));
    await assert.rejects(editComment(env.store, ctx(env, beto), c.id, 'llama al 3001234567'), status(400));
    await assert.rejects(editComment(env.store, ctx(env, beto), 'no-existe', 'x'), status(404));
    const edited = await editComment(env.store, ctx(env, beto, at(env, HOUR)), c.id, 'corregido');
    assert.equal(edited.text, 'corregido'); assert.ok(edited.editedAt);
  } finally { await env.cleanup(); }
});

test('borrar un comentario: el autor o la dueña de la publicación; con respuestas queda el hueco, sin respuestas desaparece', async () => {
  const { env, ana, beto, carla, post } = await world();
  try {
    const withReplies = await comment(env, beto, post.id, 'tiene respuestas', undefined, at(env, 1000));
    await comment(env, carla, post.id, 'respuesta', withReplies.id, at(env, 2000));
    const alone = await comment(env, beto, post.id, 'solo', undefined, at(env, 3000));
    await assert.rejects(deleteComment(env.store, ctx(env, carla), alone.id), status(403)); // ni autora ni dueña
    await deleteComment(env.store, ctx(env, ana), withReplies.id); // la dueña de la publicación puede
    await deleteComment(env.store, ctx(env, beto), alone.id); // el autor puede
    const page = await listComments(env.store, post.id, {}, carla);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].deleted, true); assert.equal(page.items[0].text, ''); assert.equal(page.items[0].repliesTotal, 1);
    assert.deepEqual(page.items[0].replies?.map(c => c.text), ['respuesta']); // la respuesta se conserva
    assert.equal((await getPost(env.store, post.id)).commentCount, 1); // el borrado ya no cuenta
    await assert.rejects(deleteComment(env.store, ctx(env, beto), withReplies.id), status(404)); // ya borrado
    await assert.rejects(editComment(env.store, ctx(env, beto), withReplies.id, 'revivir'), status(404));
  } finally { await env.cleanup(); }
});

test('borrar la publicación borra también sus me gusta y comentarios', async () => {
  const { env, ana, beto, post } = await world();
  try {
    await like(env, beto, post.id, true);
    const c = await comment(env, beto, post.id, 'hola');
    await comment(env, ana, post.id, 'gracias', c.id);
    await deletePost(deps(env), ctx(env, ana), post.id);
    await env.store.tx(async tx => { assert.equal((await tx.postLikes.list()).length, 0); assert.equal((await tx.postComments.list()).length, 0); });
    await assert.rejects(listComments(env.store, post.id, {}, beto), status(404));
    await assert.rejects(like(env, beto, post.id, true), status(404));
  } finally { await env.cleanup(); }
});

// ---------------- Avisos ----------------

test('avisos: comentario a la dueña, respuesta a quien se responde y nada por lo propio', async () => {
  const { env, ana, beto, carla, post } = await world();
  try {
    const root = await comment(env, beto, post.id, 'Principal');
    assert.equal((await notes(env, ana, 'profile.post.commented')).length, 1);
    await comment(env, ana, post.id, 'comentario de la dueña en su propia publicación'); // sin aviso a sí misma
    assert.equal((await notes(env, ana, 'profile.post.commented')).length, 1);
    const reply = await comment(env, carla, post.id, 'Respuesta de Carla', root.id);
    const replied = await notes(env, beto, 'profile.comment.replied');
    assert.equal(replied.length, 1); assert.match(replied[0].title, /Carla/); assert.equal(replied[0].link.id, `${ana}#${post.id}`);
    assert.equal((await notes(env, ana, 'profile.post.commented')).length, 1); // la respuesta no es un comentario nuevo a su publicación
    await comment(env, beto, post.id, 'Gracias Carla', reply.id); // responde a su respuesta
    assert.equal((await notes(env, carla, 'profile.comment.replied')).length, 1);
    await comment(env, beto, post.id, 'respondiéndome', root.id); // responde en su propio hilo, a sí mismo: sin aviso
    assert.equal((await notes(env, beto, 'profile.comment.replied')).length, 1);
    assert.equal((await notes(env, ana, 'profile.comment.replied')).length, 0);
  } finally { await env.cleanup(); }
});

test('avisos: si la dueña responde en el hilo de otra persona, solo se avisa a esa persona', async () => {
  const { env, ana, beto, post } = await world();
  try {
    const root = await comment(env, beto, post.id, 'Principal');
    await comment(env, ana, post.id, 'Gracias', root.id);
    assert.equal((await notes(env, beto, 'profile.comment.replied')).length, 1);
    assert.equal((await notes(env, ana)).filter(n => n.type.startsWith('profile.')).length, 1); // solo el aviso del comentario de Beto
  } finally { await env.cleanup(); }
});

// ---------------- Moderación y límites ----------------

test('denunciar un comentario: lo oculta un moderador; el autor lo ve marcado y los demás no', async () => {
  const { env, ana, beto, carla, mod, post } = await world();
  try {
    const c = await comment(env, beto, post.id, 'comentario ofensivo');
    await assert.rejects(createReport(env.store, ctx(env, beto), { targetType: 'comment', targetId: c.id, reason: 'es mi propio comentario' }), status(403));
    await assert.rejects(createReport(env.store, ctx(env, carla), { targetType: 'comment', targetId: 'no-existe', reason: 'motivo suficientemente largo' }), status(404));
    const report = await createReport(env.store, ctx(env, carla), { targetType: 'comment', targetId: c.id, reason: 'insultos hacia otras personas' });
    await assert.rejects(resolveReport(env.store, ctx(env, ana), report.id, { action: 'hide', note: 'no soy moderadora' }), status(403));
    await assert.rejects(resolveReport(env.store, ctx(env, mod), report.id, { action: 'suspend', note: 'acción que no aplica' }), status(400));
    await resolveReport(env.store, ctx(env, mod), report.id, { action: 'hide', note: 'Se oculta por incumplir las normas' });
    assert.equal((await listComments(env.store, post.id, {}, carla)).items.length, 0);
    assert.equal((await listComments(env.store, post.id, {})).items.length, 0);
    const own = (await listComments(env.store, post.id, {}, beto)).items;
    assert.equal(own.length, 1); assert.equal(own[0].hidden, true);
    assert.equal((await getPost(env.store, post.id)).commentCount, 0);
    await assert.rejects(editComment(env.store, ctx(env, beto), c.id, 'intento de revivirlo'), status(403));
  } finally { await env.cleanup(); }
});

test('hay un límite de comentarios por hora', async () => {
  const { env, beto, post } = await world();
  try {
    for (let i = 0; i < 60; i++) await comment(env, beto, post.id, `comentario ${i}`);
    await assert.rejects(comment(env, beto, post.id, 'uno más'), status(409));
    await comment(env, beto, post.id, 'ya pasó una hora', undefined, at(env, 2 * HOUR));
  } finally { await env.cleanup(); }
});
