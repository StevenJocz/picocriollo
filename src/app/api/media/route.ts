import { isSameOrigin } from '@/server/auth';
import { requireUser, route } from '@/server/api';
import { ctxFor, deps } from '@/server/context';
import { getTranscoder } from '@/server/video-transcode';
import { HttpError, ValidationError } from '@/server/errors';
import { VIDEO_LIMIT_BYTES, uploadMedia } from '@/features/profile/service/media';

export const runtime='nodejs';

// Subida de UN archivo por petición con el cuerpo en binario (no JSON): foto, video o foto de perfil.
// Query: purpose=post|avatar, thumbOf=<id del archivo>, w y h (píxeles, opcionales). La cabecera Content-Type es el tipo del archivo.
export const POST=route({auth:true},async ctx=>{
  const user=requireUser(ctx),request=ctx.request;
  if(!isSameOrigin(request))throw new HttpError(403,'Origen de solicitud no permitido.');
  const length=Number(request.headers.get('content-length')||0);
  if(length>VIDEO_LIMIT_BYTES+1024)throw new HttpError(413,'El archivo es demasiado grande.');
  const q=new URL(request.url).searchParams,purpose=q.get('purpose')??'post';
  if(purpose!=='post'&&purpose!=='avatar')throw new ValidationError('Uso de archivo no válido.');
  const bytes=new Uint8Array(await request.arrayBuffer());
  const item=await uploadMedia({...deps(),transcoder:await getTranscoder()},ctxFor(user.id),{bytes,mime:request.headers.get('content-type'),purpose,thumbOf:q.get('thumbOf')??undefined,width:q.get('w'),height:q.get('h')});
  return {id:item.id,kind:item.kind,mime:item.mime,size:item.size,url:`/api/media/${item.id}`};
});
