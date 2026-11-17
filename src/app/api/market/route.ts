import { browseListings } from '@/features/market/service/listings';
import { requireUser, route } from '@/server/api';
import { normalizeLocation } from '@/features/profile/service/location';
import { deps, lazyJobs } from '@/server/context';
import { syncDemoCommunity } from '@/server/demo-community';
import { DEMO_MARKET_LISTINGS } from '@/features/market/service/demo-listings';

export const runtime='nodejs';
const optionalNumber=(value:string|null)=>{if(value===null||value==='')return undefined;const n=Number(value);return Number.isFinite(n)?n:undefined};

// Catálogo comunitario: solo usuarios con sesión pueden consultar publicaciones aprobadas.
export const GET=route({auth:true},async ctx=>{
  const q=new URL(ctx.request.url).searchParams;
  await lazyJobs();
  const store = deps().store;
  const demoCommunity = await syncDemoCommunity(store);
  // Ubicación de quien mira: la de su cuenta o, si todavía no la guardó, la que indica la consulta (?city=…&region=…).
  const me=await store.tx(tx=>tx.users.get(requireUser(ctx).id));
  let location=me?.location;
  if(!location&&q.get('city')){try{location=normalizeLocation({city:q.get('city'),region:q.get('region')})}catch{location=undefined}}
  const result = await browseListings(store,{
    location,
    q:q.get('q')??undefined,type:q.get('type')??undefined,breed:q.get('breed')??undefined,species:q.get('species')??undefined,sex:q.get('sex')??undefined,kind:q.get('kind')??undefined,
    min:optionalNumber(q.get('min')),max:optionalNumber(q.get('max')),limit:optionalNumber(q.get('limit')),offset:optionalNumber(q.get('offset')),
  });
  return { ...result, demoListings: demoCommunity ? DEMO_MARKET_LISTINGS : [] };
});
