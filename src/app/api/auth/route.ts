import { currentUser, isSameOrigin, loginUser, logoutUser, registerUser } from '@/server/auth';
import { getStore } from '@/server/storage';
import { HttpError } from '@/server/errors';
import { StoreConflictError } from '@/server/storage/types';
import { checkPasswordResetToken, requestPasswordReset, resetPassword } from '@/server/password-reset';
import { sendResetEmail } from '@/server/reset-mail';

export const runtime='nodejs';
const failures=new Map<string,{count:number;start:number}>();
const resetAsks=new Map<string,{count:number;start:number}>();
const RESET_REPLY='Si el correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.';
const clientIp=(request:Request)=>request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request) {
  const resetToken=new URL(request.url).searchParams.get('reset');
  if(resetToken!==null){
    try { return json({valid:await checkPasswordResetToken(getStore(),resetToken)}); }
    catch { return json({error:'No se pudo verificar el enlace.'},503); }
  }
  try { return json({user:await currentUser(),storage:getStore().driver}); }
  catch { return json({error:'No se pudo verificar la sesión.'},503); }
}

export async function POST(request:Request) {
  if(!isSameOrigin(request))return json({error:'Origen de solicitud no permitido.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Se requiere contenido JSON.'},415);
  try {
    const body=await request.json() as {action?:string;email?:string;password?:string;token?:string;username?:string;city?:string;region?:string};
    if(body.action==='logout'){await logoutUser();return json({user:null});}
    if(body.action==='reset'){
      try { await resetPassword(getStore(),body.token,body.password);return json({ok:true}); }
      catch(error) {
        if(error instanceof HttpError)return json({error:error.message},error.status);
        console.error('[auth]',error);return json({error:'No se pudo restablecer la contraseña.'},503);
      }
    }
    if(body.action==='forgot'){
      const asked=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asked)||asked.length>254)return json({error:'Escribe un correo válido.'},400);
      const ipKey=clientIp(request),now=Date.now(),seen=resetAsks.get(ipKey);
      if(seen&&now-seen.start<15*60_000&&seen.count>=5)return json({error:'Demasiadas solicitudes. Espera unos minutos antes de volver a pedir el enlace.'},429);
      resetAsks.set(ipKey,{count:(seen&&now-seen.start<15*60_000?seen.count:0)+1,start:seen&&now-seen.start<15*60_000?seen.start:now});
      // Respuesta idéntica exista o no la cuenta; el envío no se espera para que el tiempo tampoco lo delate.
      void requestPasswordReset(getStore(),asked).then(found=>found&&sendResetEmail(found.email,found.token)).catch(error=>console.error('[restablecer]',error));
      return json({ok:true,message:RESET_REPLY});
    }
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const password=typeof body.password==='string'?body.password:'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:'Escribe un correo válido.'},400);
    if(body.action==='register'&&(password.length<12||password.length>128))return json({error:'La contraseña debe tener entre 12 y 128 caracteres.'},400);
    if(body.action==='login'&&(password.length<1||password.length>128))return json({error:'Revisa el correo y la contraseña.'},400);
    if(!['login','register'].includes(body.action||''))return json({error:'Acción de autenticación no válida.'},400);
    const key=`${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'}:${email}`;
    const now=Date.now(),state=failures.get(key);
    if(state&&now-state.start<15*60_000&&state.count>=8)return json({error:'Demasiados intentos. Espera 15 minutos antes de volver a probar.'},429);
    try {
      const user=body.action==='register'?await registerUser(email,password,body.username,{city:body.city,region:body.region}):await loginUser(email,password);
      if(!user){failures.set(key,{count:(state&&now-state.start<15*60_000?state.count:0)+1,start:state&&now-state.start<15*60_000?state.start:now});return json({error:'Correo o contraseña incorrectos.'},401);}
      failures.delete(key);return json({user,storage:getStore().driver});
    } catch(error) {
      if(error instanceof HttpError)return json({error:error.message},error.status);
      if(error instanceof StoreConflictError)return json({error:'Ya existe una cuenta con ese correo.'},409);
      console.error('[auth]',error);
      return json({error:'No se pudo completar la autenticación.'},503);
    }
  } catch { return json({error:'Solicitud inválida.'},400); }
}
