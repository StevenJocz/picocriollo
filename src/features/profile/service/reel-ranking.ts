// Orden «Para ti» de los reels: mezcla lo reciente, lo que está en tendencia, lo cercano, lo que sigues y lo que se parece a lo que
// la persona ya mira con interés, y luego reparte el resultado para que no sea monótono (autores y avisos nunca seguidos).
// Sin acceso a datos ni a Next: se prueba con node --test.

export interface ReelCandidate {
  key: string; at: string; authorId: string;
  /** Etiquetas de contenido: «#gallos», «breed:brahma», «species:patos», «type:video»… Son lo que el sistema aprende. */
  tags: string[];
  likes: number; comments: number;
  /** 0 = misma ciudad, 1 = mismo departamento, 2 = otro lugar. */
  bucket: 0 | 1 | 2;
  followed: boolean; liked: boolean; isAd: boolean;
}

export interface ReelInterests { weights: Record<string, number>; authors: Record<string, number>; updatedAt?: string; }
export const emptyInterests = (): ReelInterests => ({ weights: {}, authors: {} });

export type SignalType = 'view' | 'like' | 'comment' | 'follow' | 'share' | 'open';
export interface Signal { tags: string[]; authorId: string; type: SignalType; /** Milisegundos que el reel estuvo a la vista (solo para `view`). */ ms?: number; }

const DAY = 86_400_000, HALF_LIFE_DAYS = 14, MAX_WEIGHT = 30, MIN_WEIGHT = -3, MAX_TAGS = 300, MAX_AUTHORS = 200;

/** Cuánto vale una señal. Saltarse un reel en menos de 1,5 s resta un poco; mirarlo con calma, sumar; reaccionar o seguir, mucho más. */
function weightOf(signal: Signal): number {
  switch (signal.type) {
    case 'view': { const ms = signal.ms ?? 0; return ms < 1500 ? -0.4 : ms < 4000 ? 0.3 : ms < 8000 ? 1 : 2; }
    case 'like': case 'comment': case 'open': return 3;
    case 'share': case 'follow': return 4;
  }
}

const clamp = (value: number) => Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, value));
function prune(table: Record<string, number>, max: number): Record<string, number> {
  const entries = Object.entries(table).filter(([, value]) => Math.abs(value) >= 0.05);
  if (entries.length > max) entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).length = max;
  return Object.fromEntries(entries.map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
}

/** Aplica señales a los gustos. Primero se olvida un poco lo antiguo (la mitad cada 14 días) y luego se suma lo nuevo. */
export function applySignals(interests: ReelInterests, signals: Signal[], now: Date): ReelInterests {
  const elapsed = interests.updatedAt ? Math.max(0, now.getTime() - new Date(interests.updatedAt).getTime()) / DAY : 0;
  const decay = Math.pow(0.5, elapsed / HALF_LIFE_DAYS);
  const weights: Record<string, number> = {}, authors: Record<string, number> = {};
  for (const [key, value] of Object.entries(interests.weights)) weights[key] = value * decay;
  for (const [key, value] of Object.entries(interests.authors)) authors[key] = value * decay;
  for (const signal of signals) {
    const amount = weightOf(signal);
    for (const tag of new Set(signal.tags)) weights[tag] = clamp((weights[tag] ?? 0) + amount * (signal.type === 'follow' ? 0.25 : 1));
    if (signal.authorId) authors[signal.authorId] = clamp((authors[signal.authorId] ?? 0) + amount * 1.2);
  }
  return { weights: prune(weights, MAX_TAGS), authors: prune(authors, MAX_AUTHORS), updatedAt: now.toISOString() };
}

// ── Puntaje ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export interface ScoreParts { recency: number; trend: number; affinity: number; author: number; follow: number; proximity: number; liked: number; }

export function scoreReel(candidate: ReelCandidate, interests: ReelInterests, now: Date): { score: number; parts: ScoreParts } {
  const ageHours = Math.max(0, (now.getTime() - new Date(candidate.at).getTime()) / 3_600_000);
  const recency = 1.6 * Math.exp(-ageHours / 60);
  // Tendencia = ritmo de reacciones (no el total acumulado): lo que gusta rápido gana al que acumuló durante semanas.
  const trend = 1.2 * Math.tanh((candidate.likes + 2 * candidate.comments) / Math.pow(ageHours + 6, 0.6) / 2.5);
  // Los temas (#gallos, razas…) pesan más que el formato (video, foto, texto), que es común a casi todo.
  const tagSum = candidate.tags.reduce((sum, tag) => sum + (interests.weights[tag] ?? 0) * (tag.startsWith('type:') ? 0.5 : 1), 0);
  const affinity = 1.4 * Math.tanh(tagSum / 6);
  const author = 1.1 * Math.tanh((interests.authors[candidate.authorId] ?? 0) / 6);
  const follow = candidate.followed ? 1 : 0;
  const proximity = candidate.bucket === 0 ? 0.9 : candidate.bucket === 1 ? 0.4 : 0;
  const liked = candidate.liked ? -2 : 0; // lo que ya reaccionó no se vuelve a promover
  const parts = { recency, trend, affinity, author, follow, proximity, liked };
  return { score: recency + trend + affinity + author + follow + proximity + liked, parts };
}

export interface RankOptions {
  now: Date;
  /** Cambia en cada visita: mueve un poco el orden para que no sea siempre igual. */
  seed: string;
  interests: ReelInterests;
  limit: number;
  /** Claves que ya se mostraron. */
  exclude: Set<string>;
  /** Últimos reels ya mostrados (el más reciente al final): orientan la variedad del comienzo de la página. */
  recent: ReelCandidate[];
}

const POOL = 24;

/** Devuelve hasta `limit` reels, del mejor al peor, repartidos: tras cada elección se castiga repetir autor, aviso o tema. */
export function rankReels(candidates: ReelCandidate[], options: RankOptions): ReelCandidate[] {
  const base = new Map<string, number>();
  const pool = candidates.filter(candidate => !options.exclude.has(candidate.key)).map(candidate => {
    base.set(candidate.key, scoreReel(candidate, options.interests, options.now).score + 0.25 * hash01(`${options.seed}:${candidate.key}`));
    return candidate;
  }).sort((a, b) => base.get(b.key)! - base.get(a.key)! || a.key.localeCompare(b.key));

  const window: ReelCandidate[] = options.recent.slice(-3);
  const picked: ReelCandidate[] = [];
  while (picked.length < options.limit && pool.length) {
    let bestIndex = 0, bestValue = -Infinity;
    const top = Math.min(POOL, pool.length);
    for (let i = 0; i < top; i++) {
      const candidate = pool[i];
      let value = base.get(candidate.key)!;
      window.slice(-3).reverse().forEach((previous, back) => {
        const weight = [1, 0.57, 0.29][back];
        if (previous.authorId === candidate.authorId) value -= 1.4 * weight;
        if (previous.isAd && candidate.isAd) value -= 2 * weight;
        if (previous.tags.length && candidate.tags.some(tag => tag.startsWith('#') && previous.tags.includes(tag))) value -= 0.25 * weight;
      });
      if (value > bestValue) { bestValue = value; bestIndex = i; }
    }
    const [chosen] = pool.splice(bestIndex, 1);
    picked.push(chosen); window.push(chosen);
  }
  return picked;
}
