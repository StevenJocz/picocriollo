import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, normalizeFarmData } from '../src/features/farm/service/farm.service.ts';
import { allocateFertileLot, applySale, cancelSale, commercialTotals, consumeFertileEggLots, divideFertileLot, findTrace, makeCode, makeReceiptSnapshot, registerPayment, returnSale, saleTotal, validateFarmData } from '../src/features/farm/service/traceability.ts';
import type { FarmData, Sale } from '../src/models/farm.ts';

const base=()=>normalizeFarmData(demoData);
const sampleSale=(data:FarmData,lotId:string,key='sale-once'):Sale=>({id:`sale-${key}`,code:makeCode('VEN',99,key),date:'2026-10-13',customerId:data.customers[0].id,lines:[{id:`line-${key}`,product:'Huevo fértil',sourceLotId:lotId,description:'Huevos del lote',quantity:1,unit:'unidad',unitPrice:2500,discount:0}],paymentStatus:'Pagado',paymentMethod:'Efectivo',paid:2500,notes:'',idempotencyKey:key});

test('normalización asigna códigos únicos y los conserva tras editar atributos',()=>{
 const data=base(),codes=[...data.coops,...data.birds,...data.eggs,...data.incubations,...data.births,...data.breedingGroups].map(x=>x.code);
 assert.equal(codes.every(Boolean),true);assert.equal(new Set(codes).size,codes.length);
 const coopCode=data.coops[0].code,edited=normalizeFarmData({...data,coops:data.coops.map((x,i)=>i?x:{...x,name:'Otro nombre',location:'Otra ubicación'})});
 assert.equal(edited.coops[0].code,coopCode);
 assert.notEqual(makeCode('AVE',1,'a'),makeCode('AVE',1,'b'));
});

test('clasifica lotes fértiles dentro del saldo de venta sin asumir fertilidad',()=>{
 let data=base();data=allocateFertileLot(data,'egg-2',2,'','');
 assert.equal(data.fertileLots[0].available,2);assert.equal(data.fertileLots[0].fertility,'Pendiente');
 assert.throws(()=>allocateFertileLot(data,'egg-2',5,'',''),/sin asignar/);
});

test('al dividir un lote conserva relación con la fuente original',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const original=data.fertileLots[0];
 data=divideFertileLot(data,original.id,1,'split-1');const child=data.fertileLots.find(x=>x.parentLotId===original.id)!;
 assert.equal(child.sourceCollectionId,original.sourceCollectionId);assert.equal(child.initial,1);assert.equal(data.fertileLots.find(x=>x.id===original.id)?.available,1);
 assert.equal(validateFarmData(data).length,0);
});

test('los huevos de consumo se asignan y venden desde un lote distinto al fértil',()=>{
 let data=allocateFertileLot(base(),'egg-2',1,'','',undefined,'Consumo');const lot=data.fertileLots[0];
 assert.equal(lot.productType,'Huevo consumo');assert.equal(lot.sourceDestination,'Consumo');
 const sale={...sampleSale(data,lot.id,'sale-consumption'),lines:[{...sampleSale(data,lot.id,'sale-consumption').lines[0],product:'Huevo consumo' as const}]};
 data=applySale(data,sale);assert.equal(data.fertileLots[0].available,0);
});

test('incubación consume lotes disponibles y guarda el movimiento asociado',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const id=data.fertileLots[0].id;
 data=consumeFertileEggLots(data,[id],2,'inc-test','2026-10-13','inc-move');
 assert.equal(data.fertileLots[0].available,0);assert.equal(data.fertileLots[0].incubated,2);
 assert.equal(data.lotMovements[0].kind,'Incubado');assert.throws(()=>consumeFertileEggLots(data,[id],1,'inc-2','2026-10-13'),/suficientes/);
});

test('ventas son idempotentes, descuentan stock, y rechazan sobreventa',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const lot=data.fertileLots[0],sale=sampleSale(data,lot.id);
 data=applySale(data,sale);assert.equal(data.fertileLots[0].available,1);assert.equal(data.fertileLots[0].sold,1);
 assert.equal(applySale(data,sale).sales.length,data.sales.length);
 assert.throws(()=>applySale(data,{...sampleSale(data,lot.id,'sale-two'),paid:5000,lines:[{...sale.lines[0],quantity:2}]}),/disponibles/);
});

test('cancelar venta mantiene el historial y compensa el inventario',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const sale=sampleSale(data,data.fertileLots[0].id);
 data=applySale(data,sale);data=cancelSale(data,sale.id);
 assert.equal(data.sales.length,2);assert.equal(data.sales.find(x=>x.id===sale.id)?.paymentStatus,'Cancelada');assert.equal(data.fertileLots[0].available,2);
 assert.equal(data.lotMovements.filter(x=>x.kind==='Cancelación').length,1);
});

test('la consulta desde venta recorre cliente, lote y recolección sin inventar relaciones',()=>{
 let data=allocateFertileLot(base(),'egg-2',1,'','');const sale=sampleSale(data,data.fertileLots[0].id);data=applySale(data,sale);
 const chain=findTrace(data,sale.code);assert.deepEqual(chain.map(x=>x.kind),['Gallinero','Recolección','Lote de huevos fértiles','Cliente','Venta']);
 assert.equal(validateFarmData(data).length,0);
});

test('las métricas de reporte excluyen ventas canceladas y separan existencias e ingresos',()=>{
 let data=base();data.sales=[];data=allocateFertileLot(data,'egg-2',2,'','');const sale=sampleSale(data,data.fertileLots[0].id);data=applySale(data,sale);
 let metrics=commercialTotals(data,'2026-10-13','2026-10-13');assert.equal(metrics.gross,2500);assert.equal(metrics.paid,2500);assert.equal(metrics.eggsSold,1);assert.equal(metrics.availableEggs,3);
 data=cancelSale(data,sale.id);metrics=commercialTotals(data,'2026-10-13','2026-10-13');assert.equal(metrics.gross,0);assert.equal(metrics.availableEggs,4);
});

test('la validación detecta relaciones inexistentes y códigos duplicados',()=>{
 const data=base();data.fertileLots.push({...data.fertileLots[0],id:'broken-lot',code:data.fertileLots[0].code,sourceCollectionId:'missing-collection'});
 const errors=validateFarmData(data);assert.ok(errors.some(x=>x.includes('Código duplicado')));assert.ok(errors.some(x=>x.includes('recolección de origen')));
});

test('POS calcula varios productos, descuentos, total y cambio en COP',()=>{
 const data=base(),sale:Sale={...sampleSale(data,'not-used','pos-totals'),paymentStatus:'Pagado',paid:15000,lines:[{id:'a',product:'Otro',sourceLotId:'p',description:'Ponedora',quantity:2,unit:'und',unitPrice:5000,discount:1000},{id:'b',product:'Otro',sourceLotId:'q',description:'Maíz',quantity:3,unit:'kg',unitPrice:2000,discount:0}]};
 assert.equal(saleTotal(sale),15000);const receipt=makeReceiptSnapshot(sale,'La Arboleda','Cliente ocasional',20000);assert.equal(receipt.subtotal,16000);assert.equal(receipt.discount,1000);assert.equal(receipt.total,15000);assert.equal(receipt.change,5000);
});

test('el recibo conserva una copia de productos y precios históricos',()=>{
 const data=base(),sale=sampleSale(data,'lot-x'),snapshot=makeReceiptSnapshot(sale,'Pico Criollo','Cliente',3000);sale.lines[0].description='Nombre de catálogo modificado';sale.lines[0].unitPrice=9000;
 assert.equal(snapshot.lines[0].description,'Huevos del lote');assert.equal(snapshot.lines[0].unitPrice,2500);assert.equal(snapshot.tendered,3000);assert.equal(snapshot.change,500);
});

test('los abonos guardan pagos parciales y completan el saldo sin superarlo',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const sale={...sampleSale(data,data.fertileLots[0].id),paymentStatus:'Pendiente' as const,paid:0};data=applySale(data,sale);let updated=registerPayment(data,sale.id,1000,'Transferencia','2026-10-13T10:00:00.000Z');
 assert.equal(updated.sales.find(x=>x.id===sale.id)?.paymentStatus,'Parcial');updated=registerPayment(updated,sale.id,1500,'Efectivo','2026-10-13T11:00:00.000Z');
 assert.equal(updated.sales.find(x=>x.id===sale.id)?.paymentStatus,'Pagado');assert.equal(updated.sales.find(x=>x.id===sale.id)?.payments?.length,2);assert.throws(()=>registerPayment(updated,sale.id,1,'Efectivo'),/Saldo/);
});

test('devoluciones parciales ajustan existencias y guardan el código original',()=>{
 let data=allocateFertileLot(base(),'egg-2',2,'','');const sale={...sampleSale(data,data.fertileLots[0].id),lines:[{...sampleSale(data,data.fertileLots[0].id).lines[0],quantity:2}],paid:5000};data=applySale(data,sale);data=returnSale(data,sale.id,sale.lines[0].id,1,'2026-10-13');
 assert.equal(data.fertileLots[0].available,1);assert.equal(data.fertileLots[0].sold,1);assert.equal(data.sales.find(x=>x.id===sale.id)?.paymentStatus,'Devuelta parcial');assert.equal(data.lotMovements[0].kind,'Devolución');
});

test('el POS acepta un cliente ocasional y requiere existencias para productos configurables',()=>{
 const data=base(),product={id:'p1',code:'PRO-0001-ABCD1234',name:'Abono',category:'Avícola',unit:'unidad',price:4000,available:2};data.customProducts.push(product);const sale:Sale={...sampleSale(data,'p1','custom-product'),customerId:'',paymentStatus:'Pagado',paid:4000,lines:[{id:'other-1',product:'Otro',sourceLotId:'p1',sourceCode:product.code,description:product.name,quantity:1,unit:'unidad',unitPrice:4000,discount:0}]};
 const sold=applySale(data,sale);assert.equal(sold.customProducts[0].available,1);assert.equal(sold.sales[0].receiptCode,undefined);assert.throws(()=>applySale(sold,{...sale,id:'other-sale',idempotencyKey:'other-sale-2',paid:12000,lines:[{...sale.lines[0],quantity:3}]}),/disponibles/);
});

