import assert from 'node:assert/strict';
import test from 'node:test';
import { describeInvalidVideoLink, embedUrl, findVideoLink, parseVideoLink } from '../src/features/profile/service/video-links.ts';

const YT = 'dQw4w9WgXcQ';

test('YouTube: watch, youtu.be, shorts, embed, m. y youtube-nocookie', () => {
  for (const url of [`https://www.youtube.com/watch?v=${YT}`, `http://youtube.com/watch?v=${YT}&t=42s&list=PL123`, `https://m.youtube.com/watch?v=${YT}`, `https://youtu.be/${YT}?si=abc`,
    `https://www.youtube.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`, `youtube.com/watch?v=${YT}`, `  https://www.youtube.com/live/${YT}  `]) {
    const link = parseVideoLink(url);
    assert.ok(link, url);
    assert.equal(link.provider, 'youtube'); assert.equal(link.id, YT);
    assert.equal(link.aspect, 'landscape', url);
  }
  const shorts = parseVideoLink(`https://www.youtube.com/shorts/${YT}`)!;
  assert.equal(shorts.provider, 'youtube'); assert.equal(shorts.kind, 'shorts'); assert.equal(shorts.aspect, 'portrait');
  assert.equal(shorts.url, `https://www.youtube.com/shorts/${YT}`);
});

test('TikTok: enlace completo del video; los cortos se explican', () => {
  const link = parseVideoLink('https://www.tiktok.com/@criadero.pico/video/7234567890123456789?is_from_webapp=1')!;
  assert.equal(link.provider, 'tiktok'); assert.equal(link.id, '7234567890123456789'); assert.equal(link.aspect, 'portrait');
  assert.equal(link.url, 'https://www.tiktok.com/@criadero.pico/video/7234567890123456789');
  assert.equal(parseVideoLink('https://www.tiktok.com/embed/v2/7234567890123456789')?.id, '7234567890123456789');
  assert.equal(parseVideoLink('https://vm.tiktok.com/ZMabc123/'), null);
  assert.match(describeInvalidVideoLink('https://vm.tiktok.com/ZMabc123/'), /enlace completo|enlaces cortos/i);
});

test('Instagram: reel, reels, p y tv, con o sin usuario', () => {
  for (const [url, kind] of [['https://www.instagram.com/reel/C8aBcDeFgHi/', 'reel'], ['https://instagram.com/reels/C8aBcDeFgHi', 'reel'], ['https://www.instagram.com/criadero/reel/C8aBcDeFgHi/?igsh=xyz', 'reel'], ['https://www.instagram.com/p/C8aBcDeFgHi/', 'p'], ['https://www.instagram.com/tv/C8aBcDeFgHi/', 'tv']] as const) {
    const link = parseVideoLink(url)!;
    assert.ok(link, url); assert.equal(link.provider, 'instagram'); assert.equal(link.id, 'C8aBcDeFgHi'); assert.equal(link.kind, kind, url);
  }
  assert.equal(parseVideoLink('https://www.instagram.com/reel/C8aBcDeFgHi/')!.url, 'https://www.instagram.com/reel/C8aBcDeFgHi/');
});

test('rechaza dominios parecidos, otros protocolos, credenciales, ids con caracteres raros y textos', () => {
  for (const bad of [
    `https://youtube.com.evil.com/watch?v=${YT}`, `https://evilyoutube.com/watch?v=${YT}`, `https://www.youtube.com.evil.io/embed/${YT}`, `https://notyoutu.be/${YT}`,
    `javascript:alert(1)//youtube.com/watch?v=${YT}`, `data:text/html,<script>alert(1)</script>`, `ftp://www.youtube.com/watch?v=${YT}`, `https://user:pass@www.youtube.com/watch?v=${YT}`,
    'https://www.youtube.com/watch?v=corto', `https://www.youtube.com/watch?v=${YT}"><script>alert(1)</script>`, 'https://www.youtube.com/', 'https://www.tiktok.com/@alguien', 'https://www.tiktok.com/@a/video/12ab34',
    'https://www.instagram.com/reel/', 'https://www.instagram.com/criadero/', 'https://example.com/video.mp4', 'hola mundo', '', 'a'.repeat(800), 'https://www.youtube.com/watch?v=' + 'x'.repeat(600),
  ]) assert.equal(parseVideoLink(bad), null, bad.slice(0, 80));
});

test('la URL del reproductor la construye el servidor y solo con ids validados', () => {
  assert.equal(embedUrl(parseVideoLink(`https://youtu.be/${YT}`)!), `https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1`);
  assert.equal(embedUrl(parseVideoLink(`https://youtu.be/${YT}`)!, true), `https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1&autoplay=1`);
  assert.equal(embedUrl(parseVideoLink('https://www.tiktok.com/@a/video/7234567890123456789')!), 'https://www.tiktok.com/embed/v2/7234567890123456789');
  assert.equal(embedUrl(parseVideoLink('https://www.instagram.com/reel/C8aBcDeFgHi/')!), 'https://www.instagram.com/reel/C8aBcDeFgHi/embed');
  assert.equal(embedUrl(parseVideoLink('https://www.instagram.com/p/C8aBcDeFgHi/')!), 'https://www.instagram.com/p/C8aBcDeFgHi/embed');
});

test('findVideoLink toma el primer enlace compatible del texto', () => {
  assert.equal(findVideoLink('Mira mi gallo! https://example.com/x y https://youtu.be/' + YT + ' #gallos')?.id, YT);
  assert.equal(findVideoLink('sin enlaces #gallos'), null);
  assert.equal(findVideoLink('solo https://example.com/video'), null);
  assert.equal(findVideoLink('www.youtube.com/watch?v=' + YT + '.')?.id, YT, 'ignora el punto final');
});
