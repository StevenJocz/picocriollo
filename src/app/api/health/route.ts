import { getStore } from '@/server/storage';

export const runtime='nodejs';
export async function GET() {
  try {
    const store=getStore();
    await store.tx(async tx=>{await tx.users.list({email:'__health__'})});
    return Response.json({status:'ok',storage:store.driver,database:store.driver==='postgres'?'connected':'local-file'},{headers:{'Cache-Control':'no-store'}});
  }
  catch { return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
