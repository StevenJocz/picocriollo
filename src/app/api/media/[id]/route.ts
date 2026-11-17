import { route } from '@/server/api';
import { deps } from '@/server/context';
import { NotFoundError } from '@/server/errors';
import { parseRange } from '@/server/range';

export const runtime='nodejs';

// Fotos y videos de la comunidad. Requieren sesión y solo se entregan tipos permitidos.
// Acepta Range para que el navegador pueda adelantar un video. El archivo no cambia nunca (si se reemplaza, el id es nuevo): caché privada por navegador.
export const GET=route({auth:true},async ctx=>{
  const file=await deps().media.get(ctx.params.id);
  if(!file||!/^(image\/(png|jpeg|webp)|video\/(mp4|webm|quicktime))$/.test(file.mime))throw new NotFoundError('Archivo no encontrado.');
  const total=file.bytes.length,range=parseRange(ctx.request.headers.get('range'),total);
  const headers:Record<string,string>={'Content-Type':file.mime,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Disposition':'inline'};
  if(range.kind==='unsatisfiable')return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${total}`}});
  if(range.kind==='partial'){
    const part=Buffer.from(file.bytes.subarray(range.start,range.end+1));
    return new Response(part,{status:206,headers:{...headers,'Content-Range':`bytes ${range.start}-${range.end}/${total}`,'Content-Length':String(part.length)}});
  }
  return new Response(Buffer.from(file.bytes),{headers:{...headers,'Content-Length':String(total)}});
});
