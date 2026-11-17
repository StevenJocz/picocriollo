import { requireUser, route } from '@/server/api';
import { subscribe } from '@/server/live';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const HEARTBEAT_MS=25_000;

// Canal SSE: solo avisa «hay novedades» (event: notify). El cliente consulta los datos por la API normal.
// La cookie de sesión viaja sola (mismo origen) y el servidor solo avisa al usuario autenticado.
export const GET=route({auth:true},async ctx=>{
  const user=requireUser(ctx);
  const encoder=new TextEncoder();
  let cleanup=()=>{};
  const stream=new ReadableStream({
    start(controller){
      let done=false;
      const send=(text:string)=>{try{controller.enqueue(encoder.encode(text))}catch{cleanup()}};
      const finish=()=>{try{controller.close()}catch{/* ya cerrado */}};
      send('retry: 5000\n\nevent: ready\ndata: {}\n\n');
      const off=subscribe(user.id,{push:()=>send('event: notify\ndata: {}\n\n'),close:()=>{cleanup();finish()}});
      const beat=setInterval(()=>send(': ping\n\n'),HEARTBEAT_MS);
      const onAbort=()=>{cleanup();finish()};
      cleanup=()=>{if(done)return;done=true;clearInterval(beat);off();ctx.request.signal.removeEventListener('abort',onAbort)};
      ctx.request.signal.addEventListener('abort',onAbort);
    },
    cancel(){cleanup()},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
});
