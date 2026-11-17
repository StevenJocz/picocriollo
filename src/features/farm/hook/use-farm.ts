'use client';
import { useCallback, useState } from 'react';
import type { Bird, BirdEvent, Customer, CustomProduct, EntityType, FarmData, Sale, SaleLine } from '@/models/farm';
import { entityKey, newId } from '../service/farm.service';
import { remoteFarmService } from '../service/remote-farm.service';
import { localDemoFarmService } from '../service/local-demo-farm.service';
import { canConsume, nextMaintenanceDate, purchaseTotal } from '../service/rules';
import { allocateFertileLot, applySale, cancelSale, consumeFertileEggLots, divideFertileLot, makeReceiptSnapshot, registerPayment, returnSale, saleTotal, uniqueCode } from '../service/traceability';
import { activateRing, appendBirdEvent, assignRing, currentRing, markRingUnavailable, registerBird, retireBirdRing } from '../service/rings';

const empty: FarmData = {coops:[],birds:[],rings:[],birdEvents:[],eggs:[],incubations:[],births:[],breedingGroups:[],purchases:[],stock:[],movements:[],maintenance:[],fertileLots:[],chickLots:[],customers:[],sales:[],lotMovements:[],customProducts:[]};
type Payload = Record<string,string>;
const arrayAt=(data:FarmData,type:EntityType)=>data[entityKey(type)] as unknown as Record<string,unknown>[];
const numeric=(v:string|undefined)=>Number(v||0);
export function useFarm() {
 const farmService=process.env.NODE_ENV==='development'&&process.env.NEXT_PUBLIC_LOCAL_DEMO==='true'?localDemoFarmService:remoteFarmService;
 const [data,setData]=useState<FarmData>(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{setLoading(true);try{setData(await farmService.load());setError('')}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los datos.')}finally{setLoading(false)}},[farmService]);
 const clear=()=>{setData(farmService.clear());setError('');setNotice('');setLoading(false)};
 const persist=async(next:FarmData,message:string)=>{await farmService.save(next);setData(next);setNotice(message);setError('');window.setTimeout(()=>setNotice(''),3200)};
 const saveRecord=async(type:EntityType,payload:Payload,id?:string)=>{
  const next=structuredClone(data),rows=arrayAt(next,type);
  const values:Record<string,unknown>={...payload};
  for(const keyName of ['capacity','eggs','broken','dirty','incubation','consumption','sale','hatched','removed','count','quantity','unitPrice','minimum','frequencyDays','supplies']) if(keyName in values) values[keyName]=numeric(String(values[keyName]));
  if(type==='reproduccion') values.henIds=String(payload.henIds||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(type==='incubaciones') values.sourceLotIds=String(payload.sourceLotIds||'').split(',').map(x=>x.trim()).filter(Boolean);
  const prior=id?rows.find(x=>x.id===id):undefined;
  const prefixes:Partial<Record<EntityType,string>>={gallineros:'GAL',aves:'AVE',huevos:'HUE',incubaciones:'INC',nacimientos:'POL',reproduccion:'REP'};
  if(id){const index=rows.findIndex(x=>x.id===id);if(index>=0){if(type==='reproduccion'){const old=rows[index],changed=old.roosterId!==values.roosterId||JSON.stringify(old.henIds)!==JSON.stringify(values.henIds);if(changed){const hist=Array.isArray(old.membershipHistory)?old.membershipHistory as {from:string;to?:string;roosterId:string;henIds:string[]}[]:[],today=new Date().toISOString().slice(0,10);if(hist.length&&!hist[hist.length-1].to)hist[hist.length-1].to=today;else hist.push({from:String(old.startedAt||today),to:today,roosterId:String(old.roosterId||''),henIds:Array.isArray(old.henIds)?old.henIds as string[]:[]});hist.push({from:today,roosterId:String(values.roosterId||''),henIds:Array.isArray(values.henIds)?values.henIds as string[]:[]});values.membershipHistory=hist;}}rows[index]={...rows[index],...values,...(rows[index].code?{code:rows[index].code}:{})};}}
  else {const row:Record<string,unknown>={id:newId(type.slice(0,3)),...values};if(prefixes[type])row.code=uniqueCode(next,prefixes[type]!);if(type==='reproduccion')row.membershipHistory=[{from:String(values.startedAt||new Date().toISOString().slice(0,10)),roosterId:String(values.roosterId||''),henIds:Array.isArray(values.henIds)?values.henIds as string[]:[]}];rows.unshift(row);}
  if(type==='huevos'&&!prior&&values.breedingGroupId){const group=next.breedingGroups.find(x=>x.id===values.breedingGroupId);if(group)Object.assign(rows[0],{groupSnapshot:{roosterId:group.roosterId,henIds:[...group.henIds],capturedAt:String(values.date)}});}
  if(type==='aves'&&['Vendido','Fallecido','Inactivo'].includes(String(values.status))){const current=next.rings.find(ring=>ring.birdId===id&&ring.status==='Asignado'&&!ring.endedAt);if(current){current.status='Retirado';current.endedAt=new Date().toISOString().slice(0,10)}}
  if(type==='incubaciones'){
   const oldHen=prior?next.birds.find(b=>b.id===prior.henId):undefined;
   if(oldHen&&oldHen.id!==values.henId&&oldHen.status==='Clueca')oldHen.status='Activo';
   const hen=next.birds.find(b=>b.id===values.henId);
   if(hen)hen.status=values.status==='En curso'?'Clueca':'Activo';
   if(!prior&&Array.isArray(values.sourceLotIds)&&values.sourceLotIds.length){const allocated=consumeFertileEggLots(next,values.sourceLotIds as string[],Number(values.eggs),String(rows[0].id),String(values.startedAt));Object.assign(next,allocated);}
  }
  if(type==='nacimientos'&&!prior){const birth=rows[0] as Record<string,unknown>;const code=String(birth.code||uniqueCode(next,'POL'));next.chickLots.unshift({id:newId('chicklot'),code:uniqueCode(next,'POL'),birthId:String(birth.id),sourceLotIds:next.incubations.find(x=>x.id===birth.incubationId)?.sourceLotIds||[],incubationId:String(birth.incubationId),breed:String(birth.breed||'Sin clasificar'),initial:Number(birth.count),available:Number(birth.count),sold:0,coopId:String(birth.coopId||''),notes:'Lote generado al registrar el nacimiento.'});void code;}
  if(type==='compras'){
   const purchase=values,product=String(purchase.product),unit=String(purchase.unit||'kg'),qty=Number(purchase.quantity);
   if(prior){const oldStock=next.stock.find(x=>x.product.toLowerCase()===String(prior.product).toLowerCase());if(oldStock&&oldStock.quantity<Number(prior.quantity||0))throw new Error('No se puede editar: parte del insumo de esta compra ya se consumió. Registra un ajuste de inventario primero.');if(oldStock)oldStock.quantity-=Number(prior.quantity||0);next.movements.unshift({id:newId('move'),stockId:oldStock?.id||'',date:String(purchase.date),kind:'Ajuste',quantity:-Number(prior.quantity||0),coopId:String(prior.coopId||''),notes:`Ajuste por edición de compra ${id}`})}
   let stock=next.stock.find(x=>x.product.toLowerCase()===product.toLowerCase());
   if(!stock){stock={id:newId('stock'),product,category:String(purchase.category||'Otros'),quantity:0,unit,minimum:5};next.stock.unshift(stock)}
   stock.quantity+=qty;
   next.movements.unshift({id:newId('move'),stockId:stock.id,date:String(purchase.date),kind:'Compra',quantity:qty,coopId:String(purchase.coopId||''),notes:`Compra de ${product} · ${purchaseTotal(qty,Number(purchase.unitPrice))} COP`});
  }
  await persist(next,id?'Registro actualizado.':'Registro creado.');
 };
 const deleteRecord=async(type:EntityType,id:string)=>{
  const next=structuredClone(data),key=entityKey(type),rows=arrayAt(next,type),row=rows.find(x=>x.id===id);
  if(type==='gallineros'&&next.birds.some(b=>b.coopId===id)) throw new Error('Este gallinero aún tiene aves asociadas. Reubícalas o elimina sus fichas antes de eliminarlo.');
  if(type==='aves'&&(next.rings.some(x=>x.birdId===id)||next.birdEvents.some(x=>x.birdId===id)||next.eggs.some(x=>x.henId===id)||next.incubations.some(x=>x.henId===id)||next.births.some(x=>x.motherId===id||x.fatherId===id)||next.breedingGroups.some(x=>x.roosterId===id||x.henIds.includes(id))||next.birds.some(x=>x.motherId===id||x.fatherId===id))) throw new Error('Esta ave tiene historial de anillos, postura, salud, reproducción o genealogía; conserva su ficha y actualiza su estado en lugar de eliminarla.');
  if(type==='incubaciones'&&next.births.some(x=>x.incubationId===id)) throw new Error('Esta incubación tiene lotes de nacimiento vinculados. Elimínalos primero si deseas continuar.');
  if(type==='compras'&&row){const product=String(row.product),stock=next.stock.find(x=>x.product.toLowerCase()===product.toLowerCase());if(stock&&stock.quantity<Number(row.quantity||0))throw new Error('No se puede anular: parte del insumo de esta compra ya se consumió. Registra un ajuste de inventario primero.');if(stock)stock.quantity-=Number(row.quantity||0);next.movements.unshift({id:newId('move'),stockId:stock?.id||'',date:new Date().toISOString().slice(0,10),kind:'Ajuste',quantity:-Number(row.quantity||0),coopId:String(row.coopId||''),notes:`Anulación de compra ${id}`})}
  if(type==='inventario'&&row){const stock=next.stock.find(x=>x.id===row.stockId);if(stock){const quantity=Number(row.quantity||0);if(row.kind==='Compra')stock.quantity=Math.max(0,stock.quantity-quantity);else if(row.kind==='Consumo')stock.quantity+=quantity;else stock.quantity-=quantity}}
  (next[key] as unknown as Record<string,unknown>[]) = rows.filter(x=>x.id!==id);
  await persist(next,'Registro eliminado.');
 };
 const consume=async(payload:Payload)=>{
  const stock=data.stock.find(x=>x.id===payload.stockId);if(!stock)throw new Error('Selecciona un producto existente.');
  const amount=Number(payload.quantity);if(!canConsume(amount,stock.quantity))throw new Error(`Solo hay ${stock.quantity} ${stock.unit} disponibles. Ajusta la cantidad antes de guardar.`);
  const next=structuredClone(data),item=next.stock.find(x=>x.id===stock.id)!;item.quantity-=amount;
  next.movements.unshift({id:newId('move'),stockId:item.id,date:payload.date,kind:'Consumo',quantity:amount,coopId:payload.coopId||'',notes:payload.notes||'Consumo registrado'});
  await persist(next,'Consumo registrado y existencia actualizada.');
 };
 const assignBirdRing=async(number:number,birdId:string)=>{await persist(assignRing(data,number,birdId),'Anillo asignado al ave; el código interno permanece independiente.')};
 const registerBirdWithRing=async(input:Omit<Bird,'id'|'code'>,number:number,groupId?:string)=>{const next=registerBird(data,input,number);const birdId=next.rings.find(ring=>ring.number===number&&ring.status==='Asignado'&&!ring.endedAt)?.birdId||'';if(groupId){const group=next.breedingGroups.find(item=>item.id===groupId&&item.status==='Activo');if(!group)throw new Error('El grupo reproductivo ya no está activo.');if(input.sex==='Gallina'&&!group.henIds.includes(birdId))group.henIds.push(birdId);else if(input.sex==='Gallo')group.roosterId=birdId;else if(input.sex==='Pollito')throw new Error('Los pollitos no se asignan directamente a un grupo de reproducción.');}await persist(next,'Ave registrada y anillo asignado.');return birdId};
 const retireRing=async(birdId:string)=>{await persist(retireBirdRing(data,birdId),'Anillo retirado; su historial quedó conservado.')};
 const disableRing=async(number:number,notes:string)=>{await persist(markRingUnavailable(data,number,notes),'Número marcado temporalmente sin uso.')};
 const enableRing=async(number:number)=>{await persist(activateRing(data,number),'Número de anillo reactivado y disponible.')};
 const recordBirdEvent=async(input:Omit<BirdEvent,'id'>)=>{await persist(appendBirdEvent(data,input),'Evento guardado en la ficha permanente del ave.')};
 const completeTask=async(id:string)=>{
  const next=structuredClone(data),task=next.maintenance.find(x=>x.id===id);if(!task)return;
  if(task.stockId&&task.supplies>0){const stock=next.stock.find(x=>x.id===task.stockId);if(!stock)throw new Error('El producto asociado a la tarea ya no existe.');if(!canConsume(task.supplies,stock.quantity))throw new Error(`Solo quedan ${stock.quantity} ${stock.unit} de ${stock.product}. Ajusta el insumo utilizado antes de completar la tarea.`);stock.quantity-=task.supplies;next.movements.unshift({id:newId('move'),stockId:stock.id,date:new Date().toISOString().slice(0,10),kind:'Consumo',quantity:task.supplies,coopId:task.coopId,notes:`Mantenimiento: ${task.title}`})}
  task.lastDone=new Date().toISOString().slice(0,10);task.nextDue=nextMaintenanceDate(task.lastDone,task.frequencyDays);task.status='Próxima';
  await persist(next,'Tarea completada. Próxima fecha calculada desde hoy.');
 };
 const createCustomer=async(input:Omit<Customer,'id'|'code'>)=>{const next=structuredClone(data),customer={...input,id:newId('cli'),code:uniqueCode(next,'CLI')};next.customers.unshift(customer);await persist(next,'Cliente registrado.');return customer.id;};
 const createFertileLot=async(collectionId:string,quantity:number,groupId:string,breed:string,destination:'Venta'|'Consumo'|'Incubación'='Venta')=>{await persist(allocateFertileLot(data,collectionId,quantity,groupId,breed,undefined,destination),`Lote para ${destination.toLowerCase()} creado; fertilidad pendiente.`);};
 const recordSale=async(input:{customerId:string;date:string;lines:SaleLine[];paymentStatus:Sale['paymentStatus'];paymentMethod:string;paid:number;tendered?:number;farmName?:string;notes:string;idempotencyKey:string})=>farmService.exclusive(async()=>{
  const latest=await farmService.load(),id=newId('ven'),createdAt=new Date().toISOString(),sale:Sale={...input,id,code:uniqueCode(latest,'VEN'),receiptCode:uniqueCode(latest,'REC'),createdAt,lines:input.lines.map(x=>({...x,id:x.id||newId('line')})),payments:input.paid>0?[{id:newId('pay'),date:createdAt,amount:input.paid,method:input.paymentMethod,notes:'Pago inicial'}]:[]};
  const total=saleTotal(sale),tendered=input.tendered??input.paid;if(input.paymentMethod==='Efectivo'&&input.paymentStatus==='Pagado'&&tendered<total)throw new Error('El efectivo recibido debe cubrir el total, o registra la venta como parcial.');
  const next=applySale(latest,sale);if(next===latest)return latest.sales.find(x=>x.idempotencyKey===input.idempotencyKey);for(const line of sale.lines){if(line.birdId&&(line.product==='Ave adulta'||line.product==='Pollito')&&next.birds.find(bird=>bird.id===line.birdId)?.status==='Vendido'){const ring=next.rings.find(item=>item.birdId===line.birdId&&item.status==='Asignado'&&!item.endedAt);if(ring){ring.status='Retirado';ring.endedAt=sale.date;ring.notes=`Retirado por venta ${sale.code}`}}}
  const saved=next.sales.find(x=>x.id===id)!;saved.receiptSnapshot=makeReceiptSnapshot(saved,input.farmName||'Pico Criollo',next.customers.find(x=>x.id===saved.customerId)?.name||'Cliente ocasional',tendered);await persist(next,'Venta confirmada y recibo generado.');return saved;
 });
 const voidSale=async(id:string)=>{const sale=data.sales.find(item=>item.id===id),next=cancelSale(data,id);if(sale)for(const line of sale.lines){const bird=line.birdId?next.birds.find(item=>item.id===line.birdId):undefined,priorRing=data.rings.find(item=>item.birdId===line.birdId&&item.status==='Retirado'&&item.endedAt===sale.date&&item.notes===`Retirado por venta ${sale.code}`);if(bird&&bird.status!=='Vendido'&&priorRing&&!currentRing(next,priorRing.number)){const restored=assignRing(next,priorRing.number,bird.id);next.rings=restored.rings}}await persist(next,'Venta cancelada con movimientos compensatorios.');};
 const splitLot=async(id:string,quantity:number)=>{await persist(divideFertileLot(data,id,quantity),'Sublote creado; su procedencia quedó vinculada.');};
 const updateFertileLot=async(id:string,fertility:'Pendiente'|'Confirmada'|'No confirmada'|'No fértil',storageNotes:string)=>{const next=structuredClone(data),lot=next.fertileLots.find(x=>x.id===id);if(!lot)throw new Error('El lote ya no existe.');const changed=lot.fertility!==fertility;lot.fertility=fertility;lot.storageNotes=storageNotes;if(changed)next.lotMovements.unshift({id:newId('lotmove'),date:new Date().toISOString().slice(0,10),lotId:lot.id,kind:'Clasificado',quantity:0,referenceId:lot.id,notes:`Fertilidad actualizada: ${fertility}.`});await persist(next,'Datos del lote actualizados.');};
 const addPayment=async(id:string,amount:number,method:string)=>{await persist(registerPayment(data,id,amount,method),'Abono guardado en el historial de pagos.');};
 const returnItem=async(id:string,lineId:string,quantity:number)=>{await persist(returnSale(data,id,lineId,quantity),'Devolución registrada con ajuste de existencias.');};
 const createCustomProduct=async(input:Omit<CustomProduct,'id'|'code'>)=>{if(!input.name.trim()||input.available<0||input.price<0)throw new Error('El producto necesita nombre, precio y existencia válida.');const next=structuredClone(data),item={...input,id:newId('product'),code:uniqueCode(next,'PRO')};next.customProducts.unshift(item);await persist(next,'Producto agregado al catálogo local.');return item.id;};
 return {data,loading,error,notice,reload,clear,saveRecord,deleteRecord,consume,completeTask,createCustomer,createFertileLot,recordSale,voidSale,splitLot,updateFertileLot,createCustomProduct,addPayment,returnItem,assignBirdRing,registerBirdWithRing,retireRing,disableRing,enableRing,recordBirdEvent,setError,setNotice};
}
