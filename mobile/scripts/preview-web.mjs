import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Vista previa local de la exportación Expo; las rutas de la SPA vuelven a index.html.
const raiz = fileURLToPath(new URL('../dist/', import.meta.url));
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const puerto = Number(process.env.PORT || 8082);
http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let archivo = path.resolve(raiz, '.' + ruta);
    if (!archivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
    let cuerpo;
    try { cuerpo = await readFile(archivo); }
    catch {
      if (path.extname(ruta)) { res.writeHead(404).end(); return; }
      archivo = path.join(raiz, 'index.html'); cuerpo = await readFile(archivo);
    }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : cuerpo);
  } catch { res.writeHead(500).end('No se pudo abrir la exportación. Ejecuta npm run build:web.'); }
}).listen(puerto, '127.0.0.1', () => console.log(`Expo web: http://127.0.0.1:${puerto}`));
