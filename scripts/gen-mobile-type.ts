// Genera src/app/mobile-type.css: una escala tipográfica móvil derivada de los tamaños de letra de los CSS existentes.
// Cada tamaño en px menor a 16 se sube de forma proporcional (7px → 11.5px, 10px → 13px, 14px → 15px) solo por debajo de 900 px de ancho;
// el orden entre tamaños se conserva y el escritorio no cambia. Ejecutar: npm run css:mobile
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCES = ['src/app/globals.css', 'src/features/farm/style/farm.css', 'src/features/market/style/market.css'];
const OUTPUT = 'src/app/mobile-type.css';

export function mobileSize(px: number): number {
  if (px <= 0 || px >= 16) return px;
  return Math.round((11.5 + (px - 7) * 0.5) * 10) / 10;
}

/** Escala suave de escritorio: solo levanta lo que queda por debajo de 12 px (7px → 10.5px, 11px → 11.7px) y no toca 12 px o más. */
export function desktopSize(px: number): number {
  if (px <= 0 || px >= 12) return px;
  return Math.round((10.5 + (px - 7) * 0.3) * 10) / 10;
}

function splitTop(selectors: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < selectors.length; i++) {
    const c = selectors[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(selectors.slice(start, i)); start = i + 1; }
  }
  parts.push(selectors.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function declaredSize(body: string): number | undefined {
  const longhand = /(?:^|;)\s*font-size\s*:\s*(\d+(?:\.\d+)?)px/.exec(body);
  if (longhand) return Number(longhand[1]);
  const shorthand = /(?:^|;)\s*font\s*:[^;]*?(\d+(?:\.\d+)?)px/.exec(body);
  return shorthand ? Number(shorthand[1]) : undefined;
}

/** Recorre reglas y bloques @media/@supports; ignora @keyframes y @font-face. */
function collect(css: string, into: Map<string, number>) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const walk = (end: number) => {
    while (i < end) {
      const open = text.indexOf('{', i);
      if (open === -1 || open >= end) { i = end; return; }
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < end && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const inner = text.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) { const save = i; i = open + 1; walk(j - 1); i = j; void save; }
      else if (head.startsWith('@')) { i = j; }
      else {
        const size = declaredSize(inner);
        if (size !== undefined && size > 0 && size < 16) {
          for (const selector of splitTop(head)) {
            if (/^(html|body|:root|\*)/.test(selector)) continue;
            into.set(selector, size);
          }
        }
        i = j;
      }
    }
  };
  walk(text.length);
}

export function generate(read: (path: string) => string = path => readFileSync(path, 'utf8')): string {
  const sizes = new Map<string, number>();
  for (const source of SOURCES) collect(read(source), sizes);
  const block = (map: (px: number) => number) => [...sizes]
    .map(([selector, size]) => [selector, map(size), size] as const)
    .filter(([, mapped, original]) => mapped !== original)
    .map(([selector, mapped]) => `  body ${selector} { font-size: ${mapped}px; }`)
    .join('\n');
  return `/* Generado por scripts/gen-mobile-type.ts desde los CSS de src/. No editar a mano (npm run css:mobile).\n   Móvil: ningún texto por debajo de ~11.5 px. Escritorio: se levanta lo que queda por debajo de 12 px. El orden entre tamaños se conserva. */\n@media (max-width: 900px) {\n${block(mobileSize)}\n}\n@media (min-width: 901px) {\n${block(desktopSize)}\n}\n`;
}

if (process.argv[1] && process.argv[1].endsWith('gen-mobile-type.ts')) {
  writeFileSync(OUTPUT, generate());
  console.log(`Escala móvil escrita en ${OUTPUT}`);
}
