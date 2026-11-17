import { timingSafeEqual } from 'node:crypto';
import { runAllJobs } from '@/server/jobs';
import { json } from '@/server/api';
import { getMedia, getStore } from '@/server/storage';

export const runtime='nodejs';

function secretMatches(received:string|null){
  const expected=process.env.JOBS_SECRET;
  if(!expected||!received)return false;
  const a=Buffer.from(received),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}

// Para un cron externo: cierra subastas vencidas, genera recordatorios y procesa el outbox.
// Sin JOBS_SECRET configurado el endpoint queda deshabilitado.
export async function POST(request:Request){
  if(!process.env.JOBS_SECRET)return json({error:'Los trabajos programados no están configurados (falta JOBS_SECRET).'},503);
  if(!secretMatches(request.headers.get('x-jobs-secret')))return json({error:'No autorizado.'},401);
  try{return json(await runAllJobs(getStore(),new Date(),getMedia()));}
  catch(error){console.error('[jobs]',error);return json({error:'No se pudieron ejecutar los trabajos.'},503);}
}
