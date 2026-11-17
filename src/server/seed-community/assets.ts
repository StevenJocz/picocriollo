import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedAssets } from './seed.ts';

interface Manifest { files: Record<string, { width: number; height: number }>; }

/** Lee las fotos de `public/seed` (las genera `npm run seed:images`). `root` es la carpeta `public/seed`. */
export function loadSeedAssets(root: string): SeedAssets {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Manifest;
  return {
    has: name => name in manifest.files,
    image(name) {
      const size = manifest.files[name];
      if (!size) throw new Error(`Falta la foto ${name} en ${root}. Ejecuta «npm run seed:images».`);
      return { bytes: new Uint8Array(readFileSync(join(root, name))), width: size.width, height: size.height };
    },
  };
}
