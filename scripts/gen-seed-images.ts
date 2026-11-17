// Genera las fotos de la comunidad de ejemplo (public/seed) a partir de las fotos con licencia de public/fotos:
// recortes, espejos y ajustes de luz para que las 20 cuentas no repitan siempre la misma imagen. Uso: npm run seed:images
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PROFILES } from '../src/server/seed-community/profiles.ts';

const SRC = join(process.cwd(), 'public', 'fotos'), OUT = join(process.cwd(), 'public', 'seed');

interface Variant { src: string; box?: [number, number, number, number]; flip?: boolean; bright?: number; sat?: number; size: [number, number]; }
// box = [left, top, width, height] en píxeles de la foto original.
const POSTS: Variant[] = [
  { src: 'portada.jpg', size: [720, 960] },
  { src: 'portada.jpg', box: [0, 200, 900, 900], bright: 0.97, sat: 1.06, size: [720, 720] },
  { src: 'portada.jpg', box: [110, 60, 700, 700], size: [720, 720] },
  { src: 'portada.jpg', box: [200, 280, 520, 520], flip: true, bright: 1.04, size: [720, 720] },
  { src: 'escaneo-principal.jpg', size: [720, 880] },
  { src: 'escaneo-principal.jpg', box: [260, 330, 640, 640], bright: 1.05, sat: 1.08, size: [720, 720] },
  { src: 'escaneo-principal.jpg', box: [180, 250, 720, 720], size: [720, 720] },
  { src: 'escaneo-principal.jpg', box: [150, 230, 520, 520], flip: true, size: [720, 720] },
  { src: 'escaneo-tarjeta.jpg', size: [720, 720] },
  { src: 'escaneo-tarjeta.jpg', box: [60, 60, 520, 520], flip: true, bright: 1.03, size: [720, 720] },
  { src: 'ave-gallina.jpg', size: [640, 640] },
  { src: 'ave-gallina.jpg', flip: true, bright: 0.97, sat: 1.12, size: [640, 640] },
  { src: 'ave-gallo.jpg', size: [640, 640] },
  { src: 'ave-gallo.jpg', box: [20, 20, 340, 340], flip: true, bright: 1.04, size: [640, 640] },
  { src: 'ave-pollito.jpg', size: [640, 640] },
  { src: 'ave-pollito.jpg', box: [40, 40, 320, 320], flip: true, sat: 1.1, size: [640, 640] },
];
// Fotos de aves de las granjas (cuadradas, ligeras).
const BIRDS: Variant[] = [
  { src: 'portada.jpg', box: [110, 60, 700, 700], size: [640, 640] },
  { src: 'portada.jpg', box: [200, 280, 520, 520], flip: true, size: [640, 640] },
  { src: 'escaneo-principal.jpg', box: [180, 250, 720, 720], size: [640, 640] },
  { src: 'escaneo-principal.jpg', box: [150, 230, 520, 520], flip: true, size: [640, 640] },
  { src: 'ave-gallina.jpg', size: [640, 640] },
  { src: 'ave-gallina.jpg', flip: true, bright: 1.04, size: [640, 640] },
  { src: 'ave-gallo.jpg', size: [640, 640] },
  { src: 'ave-gallo.jpg', flip: true, bright: 1.03, size: [640, 640] },
  { src: 'ave-pollito.jpg', size: [640, 640] },
  { src: 'escaneo-tarjeta.jpg', box: [60, 60, 520, 520], size: [640, 640] },
];
// Recortes cuadrados de las fotos de perfil (cara o cuerpo del ave).
const AVATARS: Variant[] = [
  { src: 'portada.jpg', box: [190, 200, 520, 520], size: [320, 320] },
  { src: 'portada.jpg', box: [150, 120, 600, 600], flip: true, bright: 1.05, size: [320, 320] },
  { src: 'escaneo-principal.jpg', box: [190, 240, 420, 420], size: [320, 320] },
  { src: 'escaneo-principal.jpg', box: [200, 250, 400, 400], flip: true, sat: 1.1, size: [320, 320] },
  { src: 'ave-gallo.jpg', box: [30, 10, 340, 340], size: [320, 320] },
  { src: 'ave-gallo.jpg', flip: true, bright: 1.05, size: [320, 320] },
  { src: 'ave-gallina.jpg', box: [30, 20, 340, 340], size: [320, 320] },
  { src: 'ave-gallina.jpg', flip: true, sat: 1.1, size: [320, 320] },
  { src: 'ave-pollito.jpg', box: [30, 30, 340, 340], size: [320, 320] },
  { src: 'ave-pollito.jpg', flip: true, bright: 1.04, size: [320, 320] },
  { src: 'escaneo-tarjeta.jpg', box: [90, 60, 480, 480], size: [320, 320] },
  { src: 'portada.jpg', box: [260, 330, 420, 420], size: [320, 320] },
];

async function render(variant: Variant): Promise<Buffer> {
  let image = sharp(join(SRC, variant.src));
  if (variant.box) image = image.extract({ left: variant.box[0], top: variant.box[1], width: variant.box[2], height: variant.box[3] });
  if (variant.flip) image = image.flop();
  if (variant.bright || variant.sat) image = image.modulate({ brightness: variant.bright ?? 1, saturation: variant.sat ?? 1 });
  return image.resize(variant.size[0], variant.size[1], { fit: 'cover' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}

const pad = (n: number) => String(n).padStart(2, '0');
const manifest: Record<string, { width: number; height: number }> = {};
async function save(name: string, buffer: Buffer, size: [number, number]) {
  await writeFile(join(OUT, name), buffer);
  manifest[name] = { width: size[0], height: size[1] };
}

await mkdir(OUT, { recursive: true });
for (const [i, variant] of POSTS.entries()) await save(`post-${pad(i + 1)}.jpg`, await render(variant), variant.size);
for (const [i, variant] of BIRDS.entries()) await save(`bird-${pad(i + 1)}.jpg`, await render(variant), variant.size);
for (const profile of PROFILES) {
  if (profile.avatar.kind === 'raza') {
    const buffer = await sharp(join(OUT, 'originales', `${profile.avatar.photo}.jpg`)).resize(320, 320, { fit: 'cover', position: 'attention' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    await save(`avatar-${profile.slug}.jpg`, buffer, [320, 320]);
  } else if (profile.avatar.kind === 'photo') {
    const variant = AVATARS[(profile.avatar.variant - 1) % AVATARS.length];
    await save(`avatar-${profile.slug}.jpg`, await render(variant), variant.size);
  } else {
    const { initials, color } = profile.avatar;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1f3b2a"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="160" cy="160" r="118" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="4"/><text x="160" y="190" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
    await save(`avatar-${profile.slug}.jpg`, await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer(), [320, 320]);
  }
}
// Fotos por raza, huevos e insumos (originales con licencia en public/seed/originales): una versión de 800 px para publicaciones y otra de 560 px para avisos.
for (const file of (await readdir(join(OUT, 'originales'))).filter(name => name.endsWith('.jpg'))) {
  const base = file.replace(/\.jpg$/, ''), input = join(OUT, 'originales', file);
  for (const [suffix, max, quality] of [['', 800, 74], ['-s', 560, 72]] as const) {
    const buffer = await sharp(input).resize(max, max, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    const meta = await sharp(buffer).metadata();
    await save(`${base}${suffix}.jpg`, buffer, [meta.width ?? max, meta.height ?? max]);
  }
}
await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify({ posts: POSTS.length, birds: BIRDS.length, files: manifest }, null, 2)}
`);
console.log(`Fotos de la comunidad de ejemplo escritas en ${OUT} (${Object.keys(manifest).length} archivos).`);
