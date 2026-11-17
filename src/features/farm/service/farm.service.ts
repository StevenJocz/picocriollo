import type { EntityType, FarmData } from '@/models/farm';
import { makeCode } from './traceability.ts';

export interface FarmStore { read(): Promise<FarmData>; write(data: FarmData): Promise<void>; }
export interface FarmService extends FarmStore { load(): Promise<FarmData>; save(data: FarmData): Promise<void>; exclusive<T>(operation:()=>Promise<T>):Promise<T>; }

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const ago = (n: number) => day(-n);
export const DEMO_KEY = 'pico-criollo.demo.v1';

export const demoData: FarmData = {
 rings:[], birdEvents:[],
 coops:[
  {id:'coop-main',name:'La Arboleda',code:'GAL-01',location:'Ladera norte',capacity:42,type:'Pastoril',status:'Activo',startedAt:ago(420),notes:'Gallinero principal, buena ventilación.'},
  {id:'coop-brahma',name:'El Nogal',code:'GAL-02',location:'Patio central',capacity:18,type:'Mixto',status:'Activo',startedAt:ago(230),notes:'Espacio de reproducción.'},
  {id:'coop-chicks',name:'Nido tibio',code:'GAL-03',location:'Zona protegida',capacity:16,type:'Cría',status:'Activo',startedAt:ago(120),notes:'Área de cría y pollitos.'}
 ],
 birds:[
  {id:'bird-luna',name:'Luna',sex:'Gallina',breed:'Criolla',coopId:'coop-main',status:'Clueca',bornAt:ago(480),origin:'Nacida en la granja',motherId:'',fatherId:'',photo:'',notes:'Gallina clueca del lote PC-2026-04.'},
  {id:'bird-canela',name:'Canela',sex:'Gallina',breed:'Ponedora',coopId:'coop-main',status:'En reproducción',bornAt:ago(330),origin:'Compra local',motherId:'',fatherId:'',photo:'',notes:''},
  {id:'bird-mora',name:'Mora',sex:'Gallina',breed:'Criolla',coopId:'coop-main',status:'Activo',bornAt:ago(290),origin:'Nacida en la granja',motherId:'',fatherId:'',photo:'',notes:''},
  {id:'bird-nube',name:'Nube',sex:'Gallina',breed:'Brahma',coopId:'coop-brahma',status:'En reproducción',bornAt:ago(390),origin:'Compra local',motherId:'',fatherId:'',photo:'',notes:'Padres sin registrar.'},
  {id:'bird-sol',name:'Sol',sex:'Gallina',breed:'Brahma',coopId:'coop-brahma',status:'Activo',bornAt:ago(355),origin:'Compra local',motherId:'',fatherId:'',photo:'',notes:''},
  {id:'bird-rooster',name:'Tizón',sex:'Gallo',breed:'Criolla',coopId:'coop-main',status:'En reproducción',bornAt:ago(520),origin:'Nacido en la granja',motherId:'',fatherId:'',photo:'',notes:'Paternidad no asumida para los lotes.'},
  {id:'bird-bruno',name:'Bruno',sex:'Gallo',breed:'Brahma',coopId:'coop-brahma',status:'En reproducción',bornAt:ago(600),origin:'Compra local',motherId:'',fatherId:'',photo:'',notes:''},
  {id:'bird-p1',name:'Piquito',sex:'Pollito',breed:'Criolla',coopId:'coop-chicks',status:'Activo',bornAt:ago(18),origin:'Incubación INC-02',motherId:'bird-nube',fatherId:'',photo:'',notes:'Padre desconocido.'},
  {id:'bird-p2',name:'Miel',sex:'Pollito',breed:'Criolla',coopId:'coop-chicks',status:'Activo',bornAt:ago(18),origin:'Incubación INC-02',motherId:'bird-nube',fatherId:'',photo:'',notes:'Padre desconocido.'}
 ],
 eggs:Array.from({length:14},(_,i)=>{const total=i===0?4:3+(i%3),toIncubation=i===0?2:i%7===1?2:0;return{id:`egg-${i}`,date:ago(i===0?30:i),coopId:i%4===0?'coop-brahma':'coop-main',eggs:total,broken:i%6===0?1:0,dirty:i%4===0?1:0,incubation:toIncubation,consumption:1,sale:i===0?0:total-toIncubation-1,notes:''}}),
 incubations:[
  {id:'inc-01',henId:'bird-luna',coopId:'coop-main',startedAt:ago(9),eggs:8,hatched:0,removed:1,status:'En curso',notes:'Seguimiento tranquilo; fecha de eclosión estimada.'},
  {id:'inc-02',henId:'bird-nube',coopId:'coop-brahma',startedAt:ago(39),eggs:7,hatched:5,removed:2,status:'Finalizada',notes:'Cinco nacidos; dos huevos no eclosionaron.'},
  {id:'inc-03',code:'INC-0003-DEMO0007',type:'Natural',henId:'bird-nube',coopId:'coop-brahma',startedAt:ago(28),eggs:2,hatched:1,removed:1,status:'Finalizada',sourceLotIds:['fertile-inc-demo'],notes:'Recorrido ficticio para demostrar procedencia desde recolección.'}
 ],
 births:[{id:'birth-02',incubationId:'inc-02',date:ago(18),count:5,motherId:'bird-nube',fatherId:'',coopId:'coop-chicks',breed:'Cruce Brahma',notes:'Lote PC-2026-04; padre desconocido.'},{id:'birth-03',code:'POL-0002-DEMO0008',incubationId:'inc-03',date:ago(7),count:1,motherId:'bird-nube',fatherId:'',parentageStatus:'Desconocida',coopId:'coop-chicks',breed:'Brahma',notes:'Paternidad individual desconocida; lote asociado al grupo de procedencia.'}],
 breedingGroups:[{id:'breed-01',name:'Grupo Brahma primavera',roosterId:'bird-bruno',henIds:['bird-nube','bird-sol'],startedAt:ago(80),endedAt:'',status:'Activo',notes:'Los padres de cada huevo no se presumen.'}],
 purchases:[
  {id:'buy-01',date:ago(12),product:'Concentrado ponedoras',category:'Alimento ponedoras',quantity:40,unit:'kg',unitPrice:2900,supplier:'Agropecuaria El Campo',coopId:'coop-main',notes:''},
  {id:'buy-02',date:ago(5),product:'Viruta de pino',category:'Viruta y aserrín',quantity:20,unit:'kg',unitPrice:850,supplier:'Maderas La Colina',coopId:'coop-main',notes:''},
  {id:'buy-03',date:ago(2),product:'Maíz triturado',category:'Maíz triturado',quantity:25,unit:'kg',unitPrice:2400,supplier:'Agropecuaria El Campo',coopId:'coop-brahma',notes:''}
 ],
 stock:[{id:'stock-feed',product:'Concentrado ponedoras',category:'Alimento',quantity:31,unit:'kg',minimum:12},{id:'stock-maize',product:'Maíz triturado',category:'Alimento',quantity:25,unit:'kg',minimum:8},{id:'stock-shavings',product:'Viruta de pino',category:'Viruta',quantity:9,unit:'kg',minimum:10}],
 movements:[{id:'move-01',stockId:'stock-feed',date:ago(12),kind:'Compra',quantity:40,coopId:'coop-main',notes:'Compra buy-01'},{id:'move-02',stockId:'stock-feed',date:ago(3),kind:'Consumo',quantity:9,coopId:'coop-main',notes:'Consumo registrado'},{id:'move-03',stockId:'stock-shavings',date:ago(5),kind:'Compra',quantity:20,coopId:'coop-main',notes:'Compra buy-02'},{id:'move-04',stockId:'stock-shavings',date:ago(1),kind:'Consumo',quantity:11,coopId:'coop-main',notes:'Renovación de cama'}],
 maintenance:[
  {id:'maint-01',title:'Limpiar bebederos y comederos',coopId:'coop-main',frequencyDays:3,lastDone:ago(1),nextDue:day(2),status:'Próxima',supplies:0,notes:'Frecuencia definida por la granja.'},
  {id:'maint-02',title:'Renovar viruta de nidos',coopId:'coop-brahma',frequencyDays:14,lastDone:ago(12),nextDue:day(2),status:'Próxima',stockId:'stock-shavings',supplies:2,notes:''},
  {id:'maint-03',title:'Revisar mallas y puertas',coopId:'coop-main',frequencyDays:30,lastDone:ago(35),nextDue:ago(5),status:'Vencida',supplies:0,notes:'Revisión visual.'},
  {id:'maint-04',title:'Retirar residuos',coopId:'coop-chicks',frequencyDays:7,lastDone:ago(4),nextDue:day(3),status:'Pendiente',supplies:0,notes:''}
 ],
 fertileLots:[{id:'fertile-demo',code:'FER-0001-DEMO0001',sourceDestination:'Venta',sourceCollectionId:'egg-1',date:ago(1),coopId:'coop-main',breed:'Cruce criollo',initial:1,available:0,sold:1,incubated:0,discarded:0,fertility:'Pendiente',storageNotes:'Almacenamiento fresco y ventilado.',notes:'Lote ficticio de demostración.'},{id:'fertile-inc-demo',code:'FER-0002-DEMO0006',sourceDestination:'Incubación',sourceCollectionId:'egg-0',date:ago(30),coopId:'coop-brahma',breedingGroupId:'breed-01',groupSnapshot:{roosterId:'bird-bruno',henIds:['bird-nube','bird-sol']},breed:'Brahma',initial:2,available:0,sold:0,incubated:2,discarded:0,fertility:'Confirmada',storageNotes:'Bandeja identificada y almacenada fresca.',notes:'Huevos incubados en demostración.'},{id:'fertile-stock-demo',code:'FER-0003-DEMO0010',sourceDestination:'Venta',sourceCollectionId:'egg-2',date:ago(2),coopId:'coop-main',breed:'Criollo',initial:2,available:2,sold:0,incubated:0,discarded:0,fertility:'Pendiente',storageNotes:'Lugar fresco, sin exposición solar.',notes:'Existencia ficticia de demostración.'}],
 chickLots:[{id:'chick-lot-demo',code:'POL-0001-DEMO0002',birthId:'birth-02',sourceLotIds:[],incubationId:'inc-02',breed:'Cruce Brahma',initial:5,available:4,sold:1,coopId:'coop-chicks',notes:'Lote ficticio de demostración.'},{id:'chick-lot-inc-demo',code:'POL-0003-DEMO0009',birthId:'birth-03',sourceLotIds:['fertile-inc-demo'],incubationId:'inc-03',breed:'Brahma',initial:1,available:0,sold:1,coopId:'coop-chicks',notes:'Pollito vendido desde el lote incubado.'}],
 customers:[{id:'customer-demo',code:'CLI-0001-DEMO0003',name:'Cliente de demostración',phone:'',contact:'',notes:'Registro ficticio.'}],
 sales:[{id:'sale-demo',code:'VEN-0001-DEMO0004',receiptCode:'REC-0001-DEMO0005',createdAt:new Date(`${ago(1)}T16:00:00`).toISOString(),date:ago(1),customerId:'customer-demo',lines:[{id:'sale-line-demo',product:'Pollito',sourceLotId:'chick-lot-inc-demo',sourceCode:'POL-0003-DEMO0009',description:'Pollito Brahma · POL-0003-DEMO0009',quantity:1,unit:'unidad',unitPrice:18000,discount:0}],paymentStatus:'Pagado',paymentMethod:'Efectivo',paid:18000,notes:'Venta ficticia para recorrido de trazabilidad.',payments:[{id:'pay-demo',date:new Date(`${ago(1)}T16:00:00`).toISOString(),amount:18000,method:'Efectivo',notes:'Pago de demostración'}],receiptSnapshot:{farmName:'Pico Criollo',customerName:'Cliente de demostración',createdAt:new Date(`${ago(1)}T16:00:00`).toISOString(),subtotal:18000,discount:0,total:18000,paid:18000,tendered:20000,change:2000,paymentMethod:'Efectivo',paymentStatus:'Pagado',notes:'Venta ficticia para recorrido de trazabilidad.',lines:[{id:'sale-line-demo',product:'Pollito',sourceLotId:'chick-lot-inc-demo',sourceCode:'POL-0003-DEMO0009',description:'Pollito Brahma · POL-0003-DEMO0009',quantity:1,unit:'unidad',unitPrice:18000,discount:0}]},idempotencyKey:'demo-sale-once'}],
 lotMovements:[{id:'lot-movement-fer-inc',date:ago(30),lotId:'fertile-inc-demo',kind:'Recolectado',quantity:2,referenceId:'egg-0',notes:'Clasificado para incubación desde HUE-0001.'},{id:'lot-movement-inc-demo',date:ago(28),lotId:'fertile-inc-demo',kind:'Incubado',quantity:2,referenceId:'inc-03',notes:'Incubación INC-0003.'},{id:'lot-movement-sale-demo',date:ago(1),lotId:'chick-lot-inc-demo',kind:'Vendido',quantity:1,referenceId:'sale-demo',notes:'Venta ficticia de demostración.'},{id:'lot-movement-stock-demo',date:ago(2),lotId:'fertile-stock-demo',kind:'Recolectado',quantity:2,referenceId:'egg-2',notes:'Existencia disponible para demostración del POS.'}],
 customProducts:[]
};

const defaults: Partial<FarmData> = {rings:[],birdEvents:[],fertileLots:[],chickLots:[],customers:[],sales:[],lotMovements:[],customProducts:[]};
function stableToken(id:string){let h=0;for(let i=0;i<id.length;i++)h=(Math.imul(31,h)+id.charCodeAt(i))|0;return Math.abs(h).toString(16).padStart(8,'0').slice(-8);}
export function normalizeFarmData(input: Partial<FarmData>): FarmData {
 const data={...structuredClone(demoData),...defaults,...input} as FarmData;
 const groups:[keyof FarmData,string][]=[['coops','GAL'],['birds','AVE'],['breedingGroups','REP'],['incubations','INC'],['eggs','HUE'],['fertileLots','FER'],['births','POL'],['chickLots','POL'],['sales','VEN'],['customers','CLI']];
 for(const [key,prefix] of groups){const rows=data[key] as unknown as {id:string;code?:string}[];rows.forEach((row,index)=>{if(!row.code)row.code=makeCode(prefix,index+1,stableToken(row.id));});}
 for(const lot of data.fertileLots){lot.sourceDestination??='Venta';lot.productType??=lot.sourceDestination==='Consumo'?'Huevo consumo':'Huevo fértil';}
 return data;
}

export class LocalFarmStore implements FarmService {
 private queue:Promise<void>=Promise.resolve();
 async exclusive<T>(operation:()=>Promise<T>):Promise<T>{
  if(typeof navigator!=='undefined'&&'locks' in navigator)return navigator.locks.request('pico-criollo.local-transaction',operation);
  let release!:()=>void;const previous=this.queue;this.queue=new Promise<void>(resolve=>{release=resolve});await previous;try{return await operation()}finally{release()}
 }
 async load(): Promise<FarmData> {
  await new Promise(resolve=>setTimeout(resolve,120));
  if (typeof window === 'undefined') return structuredClone(demoData);
  try { const value=window.localStorage.getItem(DEMO_KEY); return normalizeFarmData(value ? JSON.parse(value) as Partial<FarmData> : demoData); }
  catch { throw new Error('No se pudieron leer los datos locales. Revisa el espacio disponible del navegador.'); }
 }
 async save(data: FarmData): Promise<void> {
  await new Promise(resolve=>setTimeout(resolve,100));
  try { window.localStorage.setItem(DEMO_KEY,JSON.stringify(normalizeFarmData(data))); }
  catch { throw new Error('No se pudieron guardar los cambios en este navegador.'); }
 }
 async read(): Promise<FarmData> { return this.load(); }
 async write(data: FarmData): Promise<void> { return this.save(data); }
}
export const localFarmService: FarmService = new LocalFarmStore();
const entityKeys: Record<EntityType,keyof FarmData> = {gallineros:'coops',aves:'birds',huevos:'eggs',incubaciones:'incubations',nacimientos:'births',reproduccion:'breedingGroups',compras:'purchases',inventario:'movements',mantenimiento:'maintenance'};
export const entityKey = (type: EntityType): keyof FarmData => entityKeys[type];
export const newId = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;
