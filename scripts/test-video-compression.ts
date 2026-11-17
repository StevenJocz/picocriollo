// Prueba real del compresor de videos con ffmpeg: genera un video de ejemplo de 12 s en 1080p, lo comprime como lo hace la app
// y muestra tamaños y medidas. Uso (en el servidor, con la imagen que trae ffmpeg):
//   docker run --rm -v /docker/pico-criollo:/app/repo:ro -w /app/repo imagen_pico_criollo node --experimental-strip-types scripts/test-video-compression.ts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFfmpegTranscoder } from '../src/server/video-transcode.ts';

const dir = mkdtempSync(join(tmpdir(), 'pico-video-test-'));
try {
  const source = join(dir, 'ejemplo.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=60:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`No se pudo crear el video de ejemplo (¿está instalado ffmpeg?): ${made.stderr || made.error}`);
  const input = new Uint8Array(readFileSync(source));
  const started = Date.now();
  const result = await createFfmpegTranscoder().transcode(input, 'video/mp4');
  const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;
  console.log(`Original:   ${mb(input.length)} (1920x1080, 60 fps, ${12} s)`);
  console.log(`Comprimido: ${mb(result.bytes.length)} (${result.width}x${result.height}, ${result.seconds.toFixed(1)} s) en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`Ahorro:     ${Math.round((1 - result.bytes.length / input.length) * 100)} %`);
  if (result.mime !== 'video/mp4' || result.width > 1280 || result.bytes.length >= input.length) throw new Error('El resultado no es el esperado.');
  console.log('OK: el compresor funciona.');
} finally { rmSync(dir, { recursive: true, force: true }); }
