import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_KEY, LocalFarmStore } from '../src/features/farm/service/farm.service.ts';

test('inicia con datos ficticios y conserva los cambios en el proveedor local',async()=>{
 const memory=new Map<string,string>(),localStorage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value)}};
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{localStorage} as unknown as Window});
 try{
  const store=new LocalFarmStore(),first=await store.load();
  assert.equal(first.coops.length,3);
  assert.equal(first.birds.some(bird=>bird.name==='Luna'),true);
  first.coops.push({id:'test-coop',name:'Prueba',code:'TEST',location:'',capacity:4,type:'Cría',status:'Activo',startedAt:'2026-10-01',notes:''});
  await store.save(first);
  const loaded=await store.load();
  assert.equal(loaded.coops.some(coop=>coop.id==='test-coop'),true);
  assert.equal(memory.has(DEMO_KEY),true);
 }finally{
  if(original)Object.defineProperty(globalThis,'window',original);
  else Reflect.deleteProperty(globalThis,'window');
 }
});
