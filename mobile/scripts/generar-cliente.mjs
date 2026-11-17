// Regenera los tipos del cliente a partir del OpenAPI de la API.
// Uso: levanta la API (dotnet run --project ../api/API) y ejecuta `npm run api:generar [url-del-openapi]`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5188/openapi/v1.json';
const respuesta = await fetch(url);
if (!respuesta.ok) throw new Error(`No se pudo leer ${url}: ${respuesta.status}`);
writeFileSync('src/api/openapi.json', await respuesta.text());
execFileSync('npx', ['openapi-typescript', 'src/api/openapi.json', '-o', 'src/api/schema.d.ts'], { stdio: 'inherit', shell: true });
console.log('Cliente regenerado desde', url);
