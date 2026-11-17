import type { FarmData } from '@/models/farm';
import type { FarmService } from './farm.service';

const empty:FarmData={coops:[],birds:[],rings:[],birdEvents:[],eggs:[],incubations:[],births:[],breedingGroups:[],purchases:[],stock:[],movements:[],maintenance:[],fertileLots:[],chickLots:[],customers:[],sales:[],lotMovements:[],customProducts:[]};
async function responseData(response:Response) {
  const body=await response.json().catch(()=>({error:'El servidor devolvió una respuesta inválida.'}));
  if(!response.ok)throw new Error(typeof body.error==='string'?body.error:`Error HTTP ${response.status}.`);
  return body;
}

export class RemoteFarmService implements FarmService {
  private version=0;
  private queue:Promise<void>=Promise.resolve();
  async load():Promise<FarmData>{
    const body=await responseData(await fetch('/api/farm',{cache:'no-store',credentials:'same-origin'}));
    this.version=Number(body.version);return {...structuredClone(empty),...body.data as Partial<FarmData>};
  }
  async save(data:FarmData):Promise<void>{
    const body=await responseData(await fetch('/api/farm',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,version:this.version})}));
    this.version=Number(body.version);
  }
  async read(){return this.load();}
  async write(data:FarmData){return this.save(data);}
  async exclusive<T>(operation:()=>Promise<T>):Promise<T>{
    if('locks'in navigator)return navigator.locks.request('pico-criollo.remote-transaction',operation);
    let release!:()=>void;const previous=this.queue;this.queue=new Promise<void>(resolve=>{release=resolve});await previous;try{return await operation()}finally{release();}
  }
  clear(){this.version=0;return structuredClone(empty);}
}
export const remoteFarmService=new RemoteFarmService();
