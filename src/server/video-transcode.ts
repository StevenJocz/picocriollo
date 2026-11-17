import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_VIDEO_SECONDS } from '../features/profile/service/video-policy.ts';
import type { TranscodedVideo, VideoTranscoder } from '../features/profile/service/video-policy.ts';
import { HttpError, ValidationError } from './errors.ts';

// Compresión de los videos propios con ffmpeg. Un video de teléfono de 60 MB queda en unos pocos MB con calidad visual muy parecida:
// H.264 (CRF 25), hasta 1280 px el lado largo en horizontal o 720 px de ancho en vertical, AAC a 96 kbps y `faststart`
// (el reproductor empieza a mostrarlo sin descargar todo). Se procesa un video a la vez para no saturar el servidor.

const ENCODE_TIMEOUT_MS = 240_000, PROBE_TIMEOUT_MS = 30_000;
const UNREADABLE = 'No se pudo leer el video. Prueba con otro archivo MP4, MOV o WebM.';
const FAILED = 'No se pudo procesar el video. Prueba con otro archivo MP4, MOV o WebM.';

export interface Gate { run<T>(task: () => Promise<T>): Promise<T>; }

/** Limita cuántas tareas corren a la vez; las demás esperan su turno y, si esperan demasiado, reciben «ocupado» (503). */
export function createGate(options: { max: number; maxWaitMs: number }): Gate {
  let active = 0;
  const queue: { start: () => void }[] = [];
  const next = () => { while (active < options.max && queue.length) queue.shift()!.start(); };
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const state: { started: boolean; timer?: ReturnType<typeof setTimeout> } = { started: false };
        const start = () => {
          state.started = true; active++;
          if (state.timer) clearTimeout(state.timer);
          task().then(resolve, reject).finally(() => { active--; next(); });
        };
        if (active < options.max) { start(); return; }
        const entry = { start };
        queue.push(entry);
        state.timer = setTimeout(() => {
          if (state.started) return;
          queue.splice(queue.indexOf(entry), 1);
          reject(new HttpError(503, 'El servidor está procesando otros videos. Inténtalo de nuevo en un momento.'));
        }, options.maxWaitMs);
      });
    },
  };
}

interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; }
function run(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise(resolve => {
    let stdout = '', stderr = '', timedOut = false;
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { if (stdout.length < 200_000) stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
  });
}

interface Probe { seconds: number; width: number; height: number; fps: number; hasVideo: boolean; }
interface ProbeStream { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string; disposition?: { attached_pic?: number }; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[]; }

async function probe(ffprobe: string, file: string): Promise<Probe> {
  const result = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], PROBE_TIMEOUT_MS);
  if (result.code !== 0) throw new ValidationError(UNREADABLE);
  let data: { streams?: ProbeStream[]; format?: { duration?: string } };
  try { data = JSON.parse(result.stdout); } catch { throw new ValidationError(UNREADABLE); }
  const stream = data.streams?.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic);
  if (!stream) return { seconds: 0, width: 0, height: 0, fps: 0, hasVideo: false };
  const rotation = Math.abs(Number(stream.tags?.rotate ?? stream.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? 0)) % 180;
  const [num, den] = String(stream.avg_frame_rate ?? '0/1').split('/').map(Number);
  const width = stream.width ?? 0, height = stream.height ?? 0;
  return {
    hasVideo: true, seconds: Number(data.format?.duration ?? stream.duration ?? 0) || 0, fps: den ? num / den : 0,
    width: rotation === 90 ? height : width, height: rotation === 90 ? width : height,
  };
}

const formatSeconds = (seconds: number) => (seconds >= 60 ? `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s` : `${Math.round(seconds)} s`);

export function createFfmpegTranscoder(options: { ffmpeg?: string; ffprobe?: string; crf?: number } = {}): VideoTranscoder {
  const ffmpeg = options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobe = options.ffprobe ?? process.env.FFPROBE_PATH ?? 'ffprobe', crf = options.crf ?? 25;
  const gate = createGate({ max: 1, maxWaitMs: 90_000 });
  return {
    transcode: (bytes, mime) => gate.run(async (): Promise<TranscodedVideo> => {
      const dir = await mkdtemp(join(tmpdir(), 'pico-video-'));
      try {
        const input = join(dir, mime === 'video/quicktime' ? 'in.mov' : mime === 'video/webm' ? 'in.webm' : 'in.mp4'), output = join(dir, 'out.mp4');
        await writeFile(input, bytes);
        const info = await probe(ffprobe, input);
        if (!info.hasVideo) throw new ValidationError('El archivo no tiene imagen de video.');
        if (info.seconds > MAX_VIDEO_SECONDS + 1) throw new ValidationError(`El video dura ${formatSeconds(info.seconds)} y el máximo es ${MAX_VIDEO_SECONDS / 60} minutos. Recórtalo antes de subirlo.`);
        const filters = ["scale='if(gt(a,1),min(1280,iw),min(720,iw))':-2", 'format=yuv420p', ...(info.fps > 30.5 ? ['fps=30'] : [])].join(',');
        const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', filters,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-maxrate', '3500k', '-bufsize', '7000k', '-profile:v', 'high',
          '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', '-t', String(MAX_VIDEO_SECONDS), output];
        const encoded = await run(ffmpeg, args, ENCODE_TIMEOUT_MS);
        if (encoded.timedOut) throw new ValidationError('El video tardó demasiado en procesarse. Prueba con uno más corto.');
        if (encoded.code !== 0) { console.error('[video] ffmpeg falló:', encoded.stderr.trim().slice(-600)); throw new ValidationError(FAILED); }
        const out = await readFile(output);
        if (!out.length) throw new ValidationError(FAILED);
        const finalInfo = await probe(ffprobe, output);
        return { bytes: new Uint8Array(out), mime: 'video/mp4', width: finalInfo.width || info.width, height: finalInfo.height || info.height, seconds: finalInfo.seconds || info.seconds };
      } finally { await rm(dir, { recursive: true, force: true }); }
    }),
  };
}

type Holder = typeof globalThis & { __picoTranscoder?: Promise<VideoTranscoder | undefined> };

/** El compresor de la app, o undefined si ffmpeg no está instalado (entonces los videos se guardan tal cual) o se apagó con VIDEO_TRANSCODE=off. */
export function getTranscoder(): Promise<VideoTranscoder | undefined> {
  const holder = globalThis as Holder;
  holder.__picoTranscoder ??= (async () => {
    if (process.env.VIDEO_TRANSCODE === 'off') return undefined;
    const check = await run(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-version'], 10_000);
    if (check.code !== 0) { console.warn('[video] ffmpeg no está disponible: los videos se guardarán sin comprimir.'); return undefined; }
    return createFfmpegTranscoder();
  })();
  return holder.__picoTranscoder;
}
