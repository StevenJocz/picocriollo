import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSocialLink, setSocialLinks } from '../src/features/profile/service/social-links.ts';
import { getSellerProfile } from '../src/features/market/service/seller-profile.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

test('TikTok: acepta el enlace del perfil o el @usuario y lo guarda en forma canónica', () => {
  for (const raw of ['https://www.tiktok.com/@criadero.pico', 'tiktok.com/@criadero.pico', 'https://m.tiktok.com/@criadero.pico?lang=es', '@criadero.pico', ' https://www.tiktok.com/@criadero.pico/ ']) {
    assert.equal(normalizeSocialLink('tiktok', raw), 'https://www.tiktok.com/@criadero.pico', raw);
  }
  assert.equal(normalizeSocialLink('tiktok', ''), '');
  for (const bad of ['https://www.tiktok.com/@criadero/video/7234567890123456789', 'https://vm.tiktok.com/ZMabc123/', 'https://tiktok.com.evil.com/@x', 'https://www.tiktok.com/', 'javascript:alert(1)', 'https://www.instagram.com/criadero', '@a', 'ftp://tiktok.com/@criadero']) {
    assert.throws(() => normalizeSocialLink('tiktok', bad), /TikTok/, bad);
  }
});

test('Instagram: perfil o @usuario; se rechazan publicaciones, reels y rutas reservadas', () => {
  for (const raw of ['https://www.instagram.com/criadero_pico/', 'instagram.com/criadero_pico', 'https://instagram.com/criadero_pico?igsh=abc', '@criadero_pico']) {
    assert.equal(normalizeSocialLink('instagram', raw), 'https://www.instagram.com/criadero_pico/', raw);
  }
  for (const bad of ['https://www.instagram.com/reel/C8aBcDeFgHi/', 'https://www.instagram.com/p/C8aBcDeFgHi/', 'https://www.instagram.com/explore/', 'https://www.instagram.com/', 'https://www.instagram.com.evil.com/x', 'https://www.tiktok.com/@x', 'a b']) {
    assert.throws(() => normalizeSocialLink('instagram', bad), /Instagram/, bad);
  }
});

test('YouTube: canal por @usuario, /channel, /c o /user', () => {
  assert.equal(normalizeSocialLink('youtube', 'https://www.youtube.com/@CriaderoPico'), 'https://www.youtube.com/@CriaderoPico');
  assert.equal(normalizeSocialLink('youtube', 'youtube.com/@CriaderoPico?sub_confirmation=1'), 'https://www.youtube.com/@CriaderoPico');
  assert.equal(normalizeSocialLink('youtube', 'https://m.youtube.com/channel/UCabcdefghijklmnopqrstuv'), 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
  assert.equal(normalizeSocialLink('youtube', 'https://www.youtube.com/c/CriaderoPico'), 'https://www.youtube.com/c/CriaderoPico');
  assert.equal(normalizeSocialLink('youtube', '@CriaderoPico'), 'https://www.youtube.com/@CriaderoPico');
  for (const bad of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/', 'https://youtube.com.evil.com/@x']) {
    assert.throws(() => normalizeSocialLink('youtube', bad), /YouTube/, bad);
  }
});

test('el perfil guarda los enlaces, los muestra públicamente y se pueden quitar', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
    const saved = await setSocialLinks(deps(env), ctx(env, ana), { tiktok: '@criadero.pico', instagram: 'https://www.instagram.com/criadero_pico', youtube: '' });
    assert.deepEqual(saved, { tiktok: 'https://www.tiktok.com/@criadero.pico', instagram: 'https://www.instagram.com/criadero_pico/' });
    const profile = await getSellerProfile(env.store, ana, env.now);
    assert.deepEqual(profile.links, saved);
    assert.equal((await getSellerProfile(env.store, beto, env.now)).links, undefined, 'quien no puso enlaces no los muestra');
    const edited = await setSocialLinks(deps(env), ctx(env, ana), { tiktok: '', instagram: 'https://www.instagram.com/criadero_pico/' });
    assert.deepEqual(edited, { instagram: 'https://www.instagram.com/criadero_pico/' });
    await assert.rejects(setSocialLinks(deps(env), ctx(env, ana), { tiktok: 'https://evil.example/@x' }), status(400));
    await assert.rejects(setSocialLinks(deps(env), ctx(env, ana), { tiktok: 42 }), status(400));
    assert.deepEqual((await getSellerProfile(env.store, ana, env.now)).links, edited, 'un cambio inválido no toca lo guardado');
  } finally { await env.cleanup(); }
});
