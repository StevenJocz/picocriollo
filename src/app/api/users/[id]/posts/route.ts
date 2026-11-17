import { listPosts } from '@/features/profile/service/posts';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';

// Muro comunitario: requiere sesión; el autor autenticado también ve lo que la moderación ocultó.
export const GET=route({auth:true},async ctx=>{
  const q=new URL(ctx.request.url).searchParams,limit=Number(q.get('limit'));
  return listPosts(deps().store,ctx.params.id,{before:q.get('before')??undefined,limit:Number.isFinite(limit)&&limit>0?limit:undefined},ctx.user?.id);
});
