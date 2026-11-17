import assert from 'node:assert/strict';
import test from 'node:test';
import { applySignals, emptyInterests, rankReels, scoreReel } from '../src/features/profile/service/reel-ranking.ts';
import type { ReelCandidate } from '../src/features/profile/service/reel-ranking.ts';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const reel = (key: string, extra: Partial<ReelCandidate> = {}): ReelCandidate => ({ key, at: hoursAgo(5), authorId: `autor-${key}`, tags: [], likes: 0, comments: 0, bucket: 0, followed: false, liked: false, isAd: false, ...extra });
const rank = (candidates: ReelCandidate[], extra: Record<string, unknown> = {}) => rankReels(candidates, { now: NOW, seed: 'semilla', interests: emptyInterests(), limit: 50, exclude: new Set(), recent: [], ...extra } as never).map(item => item.key);

test('lo reciente y lo que gusta a la gente sube; lo viejo y sin reacciones baja', () => {
  const order = rank([
    reel('viejo-sin-nada', { at: hoursAgo(24 * 20) }),
    reel('nuevo-sin-nada', { at: hoursAgo(2) }),
    reel('tendencia', { at: hoursAgo(10), likes: 40, comments: 12 }),
    reel('viejo-famoso', { at: hoursAgo(24 * 20), likes: 30, comments: 5 }),
  ]);
  assert.equal(order[0], 'tendencia');
  assert.equal(order[order.length - 1], 'viejo-sin-nada');
  assert.ok(order.indexOf('viejo-famoso') < order.indexOf('viejo-sin-nada'), 'con reacciones, lo viejo aguanta más');
});

test('la tendencia premia el ritmo de reacciones, no solo el total acumulado', () => {
  const fast = reel('rapido', { at: hoursAgo(3), likes: 20, comments: 4 }), slow = reel('lento', { at: hoursAgo(24 * 10), likes: 20, comments: 4 });
  const interests = emptyInterests();
  assert.ok(scoreReel(fast, interests, NOW).score > scoreReel(slow, interests, NOW).score);
});

test('el sistema aprende: lo que se parece a lo que ya viste con interés sube', () => {
  const learned = applySignals(emptyInterests(), [
    { tags: ['#gallos', 'breed:brahma'], authorId: 'criador-x', type: 'view', ms: 12_000 },
    { tags: ['#gallos', 'breed:brahma'], authorId: 'criador-y', type: 'view', ms: 9_000 },
    ...Array.from({ length: 4 }, () => ({ tags: ['#huevos'], authorId: 'criador-z', type: 'view' as const, ms: 600 })),
  ], NOW);
  const candidates = [
    reel('huevos', { tags: ['#huevos'], authorId: 'a1' }),
    reel('gallos', { tags: ['#gallos', 'breed:brahma'], authorId: 'a2' }),
    reel('otro', { tags: ['#pollitos'], authorId: 'a3' }),
  ];
  assert.equal(rank(candidates, { interests: learned })[0], 'gallos');
  const order = rank(candidates, { interests: learned });
  assert.ok(order.indexOf('huevos') > order.indexOf('otro'), 'lo que se salta rápido baja');
  assert.deepEqual(rank(candidates).length, 3);
});

test('las señales fuertes (me gusta, comentario, seguir, compartir) pesan más que mirar', () => {
  const view = applySignals(emptyInterests(), [{ tags: ['#a'], authorId: 'x', type: 'view', ms: 5_000 }], NOW);
  const like = applySignals(emptyInterests(), [{ tags: ['#a'], authorId: 'x', type: 'like' }], NOW);
  const follow = applySignals(emptyInterests(), [{ tags: ['#a'], authorId: 'x', type: 'follow' }], NOW);
  assert.ok(like.weights['#a'] > view.weights['#a']);
  assert.ok(follow.authors.x > like.authors.x);
});

test('los gustos se van olvidando con el tiempo y tienen tope', () => {
  const old = applySignals(emptyInterests(), [{ tags: ['#a'], authorId: 'x', type: 'like' }], new Date(NOW.getTime() - 60 * 86_400_000));
  const later = applySignals(old, [], NOW);
  assert.ok(later.weights['#a'] < old.weights['#a'] / 4, 'tras dos meses queda una fracción');
  let heavy = emptyInterests();
  for (let i = 0; i < 200; i++) heavy = applySignals(heavy, [{ tags: ['#a'], authorId: 'x', type: 'follow' }], NOW);
  assert.ok(heavy.weights['#a'] <= 30 && heavy.authors.x <= 30);
  let negative = emptyInterests();
  for (let i = 0; i < 50; i++) negative = applySignals(negative, [{ tags: ['#b'], authorId: 'y', type: 'view', ms: 100 }], NOW);
  assert.ok(negative.weights['#b'] >= -3, 'saltarse algo muchas veces no lo entierra para siempre');
});

test('variedad: no se ven seguidos varios reels del mismo autor ni todos del mismo tipo cuando hay alternativas', () => {
  const same = Array.from({ length: 8 }, (_, i) => reel(`mismo-${i}`, { authorId: 'unico', at: hoursAgo(1 + i), tags: ['#gallos'], likes: 10 }));
  const others = ['b', 'c', 'd', 'e'].map((id, i) => reel(`otro-${id}`, { authorId: `autor-${id}`, at: hoursAgo(12 + i), tags: ['#pollitos'], likes: 2 }));
  const order = rank([...same, ...others]);
  // Mientras queden otros autores (los primeros 8 lugares), el de siempre no se repite seguido; al final solo quedan reels suyos.
  const authors = order.slice(0, 8).map(key => [...same, ...others].find(item => item.key === key)!.authorId);
  let run = 1, longest = 1;
  for (let i = 1; i < authors.length; i++) { run = authors[i] === authors[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
  assert.ok(longest <= 2, `tanda más larga del mismo autor: ${longest} (${authors.join(',')})`);
  assert.equal(order.length, 12, 'nada se pierde, solo se reparte');
});

test('los avisos del mercado no van pegados: se intercalan con publicaciones', () => {
  const ads = Array.from({ length: 4 }, (_, i) => reel(`aviso-${i}`, { isAd: true, authorId: `vend-${i}`, at: hoursAgo(1 + i), likes: 8 }));
  const posts = Array.from({ length: 6 }, (_, i) => reel(`post-${i}`, { authorId: `p-${i}`, at: hoursAgo(2 + i * 3), likes: 1 }));
  const order = rank([...ads, ...posts]);
  for (let i = 1; i < order.length; i++) assert.ok(!(order[i].startsWith('aviso') && order[i - 1].startsWith('aviso')), `avisos seguidos en ${i}: ${order.join(',')}`);
});

test('lo ya visto no se repite y la lista recibida como «recientes» orienta la variedad de la siguiente página', () => {
  const list = [reel('a1', { authorId: 'A' }), reel('a2', { authorId: 'A' }), reel('b1', { authorId: 'B' }), reel('c1', { authorId: 'C' })];
  assert.ok(!rank(list, { exclude: new Set(['b1']) }).includes('b1'));
  const next = rank(list, { exclude: new Set(['a1']), recent: [list[0]] });
  assert.notEqual(next[0], 'a2', 'tras mostrar a un autor, la siguiente página no empieza con el mismo');
});

test('con la misma semilla el orden es estable y con otra cambia un poco (para que no sea monótono entre visitas)', () => {
  const list = Array.from({ length: 12 }, (_, i) => reel(`r${i}`, { authorId: `autor-${i}`, at: hoursAgo(4 + i * 0.5), likes: 3 }));
  assert.deepEqual(rank(list, { seed: 'uno' }), rank(list, { seed: 'uno' }));
  assert.notDeepEqual(rank(list, { seed: 'uno' }), rank(list, { seed: 'dos' }));
});

test('lo cercano suma, y quien sigues también', () => {
  const list = [reel('lejos', { bucket: 2 }), reel('cerca', { bucket: 0 }), reel('mi-ciudad-region', { bucket: 1 })];
  assert.equal(rank(list)[0], 'cerca');
  const withFollow = [reel('desconocido'), reel('seguido', { followed: true })];
  assert.equal(rank(withFollow)[0], 'seguido');
});
