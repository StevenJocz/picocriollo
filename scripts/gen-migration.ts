// Genera database/migrations/002_market.sql desde src/server/storage/specs.ts.
// Uso: npm run db:migration
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDdl } from '../src/server/storage/ddl.ts';

const target = fileURLToPath(new URL('../database/migrations/002_market.sql', import.meta.url));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, generateDdl(), 'utf8');
console.log(`Migración escrita en ${target}`);
