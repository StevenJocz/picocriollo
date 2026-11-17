import type { FarmData, Sale, SaleLine } from '@/models/farm';

export function makeCode(prefix: string, ordinal: number, token = crypto.randomUUID()) {
  return `${prefix}-${String(ordinal).padStart(4, '0')}-${token.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function uniqueCode(data: FarmData, prefix: string, token?: string) {
  const codes = new Set(allTraceRows(data).map(row => row.code).filter(Boolean));
  let ordinal = codes.size + 1;
  let code = makeCode(prefix, ordinal, token);
  while (codes.has(code)) code = makeCode(prefix, ++ordinal);
  return code;
}

export function allTraceRows(data: FarmData): { id: string; code: string; kind: string; title: string; date: string; details: string; parentIds: string[] }[] {
  const birdName=(id:string)=>data.birds.find(b=>b.id===id)?.name||'';
  const birdLineage=(bird:{motherId:string;fatherId:string;sex:string})=>{
    const father=bird.fatherId?birdName(bird.fatherId)||'ave sin nombre':'padre desconocido';
    const mother=bird.motherId?birdName(bird.motherId)||'ave sin nombre':'madre desconocida';
    return `Padre: ${father} · Madre: ${mother}`;
  };
  return [
    ...data.coops.map(x=>({id:x.id,code:x.code,kind:'Gallinero',title:x.name,date:x.startedAt,details:x.location,parentIds:[]})),
    ...data.birds.map(x=>({id:x.id,code:x.code||'',kind:'Ave',title:x.name,date:x.bornAt,details:`${x.sex} · ${x.breed} · ${birdLineage(x)}`,parentIds:[x.coopId,x.motherId,x.fatherId].filter(Boolean)})),
    ...data.breedingGroups.map(x=>({id:x.id,code:x.code||'',kind:'Grupo reproductor',title:x.name,date:x.startedAt,details:x.breed||'',parentIds:[x.coopId||'',x.roosterId,...x.henIds].filter(Boolean)})),
    ...data.eggs.map(x=>({id:x.id,code:x.code||'',kind:'Recolección',title:`${x.eggs} huevos`,date:x.date,details:`${x.consumption} consumo · ${x.incubation} incubación · ${x.sale} venta`,parentIds:[x.coopId,x.breedingGroupId||'',...(x.groupSnapshot?[x.groupSnapshot.roosterId,...x.groupSnapshot.henIds]:[])]})),
    ...data.fertileLots.map(x=>({id:x.id,code:x.code,kind:'Lote de huevos fértiles',title:`${x.available} disponibles`,date:x.date,details:`${x.breed} · Fertilidad ${x.fertility}`,parentIds:[x.sourceCollectionId,x.coopId,x.breedingGroupId||'',x.parentLotId||'',...(x.groupSnapshot?[x.groupSnapshot.roosterId,...x.groupSnapshot.henIds]:[])]})),
    ...data.incubations.map(x=>({id:x.id,code:x.code||'',kind:'Incubación',title:`${x.eggs} huevos`,date:x.startedAt,details:x.status,parentIds:[x.henId,x.coopId,...(x.sourceLotIds||[])]})),
    ...data.births.map(x=>({id:x.id,code:x.code||'',kind:'Nacimiento',title:`${x.count} pollitos`,date:x.date,details:`${x.breed} · Padre: ${x.fatherId?birdName(x.fatherId)||'ave sin nombre':'desconocido'} · Madre: ${x.motherId?birdName(x.motherId)||'ave sin nombre':'desconocida'}`,parentIds:[x.incubationId,x.motherId,x.fatherId].filter(Boolean)})),
    ...data.chickLots.map(x=>({id:x.id,code:x.code,kind:'Lote de pollitos',title:`${x.available} disponibles`,date:data.births.find(b=>b.id===x.birthId)?.date||'',details:x.breed,parentIds:[x.birthId,x.incubationId,...x.sourceLotIds]})),
    ...data.customers.map(x=>({id:x.id,code:x.code,kind:'Cliente',title:x.name,date:'',details:x.phone,parentIds:[]})),
    ...data.customProducts.map(x=>({id:x.id,code:x.code,kind:'Producto',title:x.name,date:'',details:`${x.available} ${x.unit} disponibles`,parentIds:[]})),
    ...data.sales.map(x=>({id:x.id,code:x.code,kind:'Venta',title:`${saleTotal(x).toLocaleString('es-CO')} COP`,date:x.date,details:x.paymentStatus,parentIds:[...x.lines.map(l=>l.sourceLotId||l.birdId||''),x.customerId].filter(Boolean)})),
    ...data.sales.filter(x=>x.receiptCode).map(x=>({id:`${x.id}-receipt`,code:x.receiptCode!,kind:'Recibo de venta',title:x.code,date:x.date,details:x.paymentStatus,parentIds:[x.id]})),
  ];
}

export function saleTotal(sale: Pick<Sale,'lines'>) {
  return sale.lines.reduce((sum,line)=>sum+Math.max(0,line.quantity*line.unitPrice-line.discount),0);
}

export function makeReceiptSnapshot(sale:Sale,farmName:string,customerName:string,tendered=sale.paid){
  const subtotal=sale.lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0),discount=sale.lines.reduce((sum,line)=>sum+line.discount,0),total=saleTotal(sale);
  return {farmName,customerName,createdAt:sale.createdAt||new Date().toISOString(),subtotal,discount,total,paid:sale.paid,tendered,change:sale.paymentMethod==='Efectivo'?Math.max(0,tendered-total):0,paymentMethod:sale.paymentMethod,paymentStatus:sale.paymentStatus,notes:sale.notes,lines:structuredClone(sale.lines)};
}

export function applySale(data: FarmData, sale: Sale): FarmData {
  if (data.sales.some(x=>x.idempotencyKey===sale.idempotencyKey)) return data;
  if (sale.customerId&&!data.customers.some(x=>x.id===sale.customerId)) throw new Error('El cliente no existe.');
  if (!sale.lines.length) throw new Error('Agrega al menos un producto a la venta.');
  if (sale.lines.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unitPrice)||x.unitPrice<0||x.discount<0||x.discount>x.quantity*x.unitPrice)) throw new Error('Revisa cantidad, precio y descuento de cada línea.');
  const saleCopy=structuredClone(sale),total=saleTotal(saleCopy);
  if(!Number.isFinite(saleCopy.paid)||saleCopy.paid<0||saleCopy.paid>total)throw new Error('El abono no puede ser negativo ni superar el total de la venta.');
  if((saleCopy.paymentStatus==='Pagado'&&saleCopy.paid!==total)||(saleCopy.paymentStatus==='Pendiente'&&saleCopy.paid!==0)||(saleCopy.paymentStatus==='Parcial'&&(saleCopy.paid<=0||saleCopy.paid>=total)))throw new Error('El estado del pago no coincide con el abono registrado.');
  const next=structuredClone(data);
  for (const line of saleCopy.lines) {
    if (line.product==='Ave adulta') {
      const bird=next.birds.find(x=>x.id===line.birdId);
      if (!bird||bird.status==='Vendido'||line.quantity!==1) throw new Error('El ave no está disponible para la venta.');
      line.priorBirdStatus=bird.status;line.sourceCode=bird.code;bird.status='Vendido'; continue;
    }
    if(line.product==='Otro'){const product=next.customProducts.find(x=>x.id===line.sourceLotId);if(!product)throw new Error('Selecciona un producto configurable del catálogo.');if(line.quantity>product.available)throw new Error(`Solo hay ${product.available} ${product.unit} disponibles de ${product.name}.`);product.available-=line.quantity;line.sourceCode=product.code;next.lotMovements.unshift({id:crypto.randomUUID(),date:sale.date,lotId:product.id,kind:'Vendido',quantity:line.quantity,referenceId:sale.id,notes:`Venta ${sale.code}`});continue;}
    if(line.product==='Pollito'&&line.birdId){const bird=next.birds.find(x=>x.id===line.birdId);if(!bird||bird.sex!=='Pollito'||bird.status==='Vendido'||line.quantity!==1)throw new Error('El pollito individual no está disponible para la venta.');line.priorBirdStatus=bird.status;line.sourceCode=bird.code;bird.status='Vendido';continue;}
    if(line.product==='Pollito'&&line.birdId===undefined&&line.sourceLotId==='')throw new Error('Selecciona un lote de pollitos o un pollito individual.');
    const lot=line.product==='Pollito'?next.chickLots.find(x=>x.id===line.sourceLotId):next.fertileLots.find(x=>x.id===line.sourceLotId);
    if (!lot) throw new Error('El lote seleccionado no existe.');
    if(line.product!=='Pollito'){
      const eggLot=next.fertileLots.find(x=>x.id===line.sourceLotId);
      if(eggLot?.sourceDestination==='Incubación')throw new Error('Este lote se reservó para incubación y no se puede vender.');
      const expected=line.product==='Huevo consumo'?'Huevo consumo':'Huevo fértil';
      if(eggLot?.productType!==expected)throw new Error(`El lote seleccionado no corresponde al producto ${expected.toLowerCase()}.`);
    }
    if (line.quantity>lot.available) throw new Error(`Solo hay ${lot.available} unidades disponibles en ${lot.code}.`);
    line.sourceCode=lot.code;lot.available-=line.quantity;lot.sold+=line.quantity;
    next.lotMovements.unshift({id:crypto.randomUUID(),date:sale.date,lotId:lot.id,kind:'Vendido',quantity:line.quantity,referenceId:sale.id,notes:`Venta ${sale.code}`});
  }
  next.sales.unshift(saleCopy);return next;
}

export function cancelSale(data: FarmData, saleId: string): FarmData {
  const next=structuredClone(data),sale=next.sales.find(x=>x.id===saleId);
  if (!sale) throw new Error('La venta no existe.');
  if (sale.paymentStatus==='Cancelada') return next;
  for (const line of sale.lines) {
    if (line.product==='Ave adulta'||(line.product==='Pollito'&&line.birdId)) {const bird=next.birds.find(x=>x.id===line.birdId);if(bird){bird.status=line.priorBirdStatus||'Activo';next.lotMovements.unshift({id:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),lotId:bird.id,kind:'Cancelación',quantity:line.quantity,referenceId:sale.id,notes:`Compensación de venta ${sale.code} · ${bird.code}`});}continue;}
    if(line.product==='Otro'){const product=next.customProducts.find(x=>x.id===line.sourceLotId);if(product){product.available+=line.quantity;next.lotMovements.unshift({id:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),lotId:product.id,kind:'Cancelación',quantity:line.quantity,referenceId:sale.id,notes:`Cancelación de venta ${sale.code}`});}continue;}
    const lot=line.product==='Pollito'?next.chickLots.find(x=>x.id===line.sourceLotId):next.fertileLots.find(x=>x.id===line.sourceLotId);
    if(lot){lot.available+=line.quantity;lot.sold=Math.max(0,lot.sold-line.quantity);next.lotMovements.unshift({id:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),lotId:lot.id,kind:'Cancelación',quantity:line.quantity,referenceId:sale.id,notes:`Compensación de venta ${sale.code}`});}
  }
  sale.paymentStatus='Cancelada';sale.refunded=(sale.refunded||0)+Math.max(0,sale.paid-(sale.refunded||0));return next;
}

export function registerPayment(data:FarmData,saleId:string,amount:number,method:string,date=new Date().toISOString()):FarmData {
  const next=structuredClone(data),sale=next.sales.find(x=>x.id===saleId);if(!sale)throw new Error('La venta no existe.');if(['Cancelada','Devuelta'].includes(sale.paymentStatus))throw new Error('No se pueden registrar abonos en una venta cancelada o devuelta.');
  const balance=Math.max(0,saleTotal(sale)-(sale.refunded||0)-sale.paid);if(balance===0)throw new Error('Saldo pendiente en cero.');if(!Number.isFinite(amount)||amount<=0||amount>balance)throw new Error(`El abono debe estar entre 1 y ${balance} COP de saldo pendiente.`);
  sale.payments=[...(sale.payments||[]),{id:crypto.randomUUID(),date,amount,method,notes:'Abono registrado'}];sale.paid+=amount;sale.paymentMethod=method;sale.paymentStatus=sale.paid>=(saleTotal(sale)-(sale.refunded||0))?'Pagado':'Parcial';return next;
}

export function returnSale(data:FarmData,saleId:string,lineId:string,quantity:number,date=new Date().toISOString().slice(0,10)):FarmData {
  const next=structuredClone(data),sale=next.sales.find(x=>x.id===saleId);if(!sale)throw new Error('La venta no existe.');if(['Cancelada','Devuelta'].includes(sale.paymentStatus))throw new Error('La venta ya está cancelada o devuelta.');
  const line=sale.lines.find(x=>x.id===lineId);if(!line)throw new Error('El producto no pertenece a esta venta.');const remaining=line.quantity-(line.returned||0);if(!Number.isInteger(quantity)||quantity<=0||quantity>remaining)throw new Error(`Solo quedan ${remaining} unidades de esta línea para devolver.`);
  if(line.product==='Ave adulta'||(line.product==='Pollito'&&line.birdId)){const bird=next.birds.find(x=>x.id===line.birdId);if(bird){bird.status=line.priorBirdStatus||'Activo';}}
  else if(line.product==='Pollito'){const lot=next.chickLots.find(x=>x.id===line.sourceLotId);if(lot){lot.available+=quantity;lot.sold=Math.max(0,lot.sold-quantity);}}
  else if(line.product==='Otro'){const item=next.customProducts.find(x=>x.id===line.sourceLotId);if(item)item.available+=quantity;}
  else {const lot=next.fertileLots.find(x=>x.id===line.sourceLotId);if(lot){lot.available+=quantity;lot.sold=Math.max(0,lot.sold-quantity);}}
  line.returned=(line.returned||0)+quantity;const refund=line.quantity?((line.quantity*line.unitPrice-line.discount)/line.quantity)*quantity:0;sale.returnedTotal=(sale.returnedTotal||0)+refund;sale.refunded=(sale.refunded||0)+Math.min(refund,Math.max(0,sale.paid-(sale.refunded||0)));
  const fullyReturned=sale.lines.every(x=>(x.returned||0)>=x.quantity);sale.paymentStatus=fullyReturned?'Devuelta':'Devuelta parcial';next.lotMovements.unshift({id:crypto.randomUUID(),date,lotId:line.sourceLotId||line.birdId||'custom',kind:'Devolución',quantity,referenceId:sale.id,notes:`Devolución de ${sale.code} · ${line.sourceCode||line.description}`});return next;
}

export function divideFertileLot(data: FarmData, lotId: string, quantity: number, token=crypto.randomUUID()): FarmData {
  const next=structuredClone(data),source=next.fertileLots.find(x=>x.id===lotId);
  if(!source)throw new Error('El lote de origen no existe.');
  if(!Number.isInteger(quantity)||quantity<=0||quantity>source.available)throw new Error('La división debe ser una cantidad entera disponible en el lote.');
  source.available-=quantity;
  const child={...source,id:`lot-${token}`,code:uniqueCode(next,'FER',token),parentLotId:source.id,initial:quantity,available:quantity,sold:0,incubated:0,discarded:0};
  next.fertileLots.unshift(child);next.lotMovements.unshift({id:`movement-${token}`,date:new Date().toISOString().slice(0,10),lotId:source.id,kind:'Dividido',quantity,referenceId:child.id,notes:`Sublote ${child.code}`});
  return next;
}

export function allocateFertileLot(data:FarmData,collectionId:string,quantity:number,groupId:string,breed:string,token=crypto.randomUUID(),destination:'Venta'|'Consumo'|'Incubación'='Venta'):FarmData {
  const next=structuredClone(data),collection=next.eggs.find(x=>x.id===collectionId);
  if(!collection)throw new Error('La recolección no existe.');
  const allocated=next.fertileLots.filter(x=>x.sourceCollectionId===collectionId&&!x.parentLotId&&x.sourceDestination===destination).reduce((s,x)=>s+x.initial,0),budget=destination==='Venta'?collection.sale:destination==='Consumo'?collection.consumption:collection.incubation;
  if(!Number.isInteger(quantity)||quantity<=0||allocated+quantity>budget)throw new Error(`La recolección tiene ${budget-allocated} huevos de ${destination.toLowerCase()} sin asignar a lotes.`);
  const group=next.breedingGroups.find(x=>x.id===(groupId||collection.breedingGroupId));
  const lot={id:`fer-${token}`,code:uniqueCode(next,'FER',token),sourceCollectionId:collection.id,sourceDestination:destination,productType:destination==='Consumo'?'Huevo consumo' as const:'Huevo fértil' as const,date:collection.date,coopId:collection.coopId,breedingGroupId:group?.id,groupSnapshot:collection.groupSnapshot||(group?{roosterId:group.roosterId,henIds:[...group.henIds]}:undefined),breed:breed||group?.breed||'Sin clasificar',initial:quantity,available:quantity,sold:0,incubated:0,discarded:0,fertility:'Pendiente' as const,storageNotes:'',notes:''};
  next.fertileLots.unshift(lot);next.lotMovements.unshift({id:`lotmove-${token}`,date:collection.date,lotId:lot.id,kind:'Recolectado',quantity,referenceId:collection.id,notes:`Procede de ${collection.code||collection.id}; fertilidad pendiente.`});return next;
}

export function consumeFertileEggLots(data:FarmData,lotIds:string[],quantity:number,incubationId:string,date:string,token=crypto.randomUUID()):FarmData {
  const next=structuredClone(data);const available=lotIds.reduce((s,id)=>s+(next.fertileLots.find(x=>x.id===id)?.available||0),0);
  if(!Number.isInteger(quantity)||quantity<=0||available<quantity)throw new Error('Los lotes seleccionados no tienen suficientes huevos disponibles.');
  let remaining=quantity;for(const lotId of lotIds){const lot=next.fertileLots.find(x=>x.id===lotId);if(!lot)throw new Error(`El lote ${lotId} no existe.`);const used=Math.min(remaining,lot.available);if(used){lot.available-=used;lot.incubated+=used;next.lotMovements.unshift({id:`${token}-${lot.id}`,date,lotId,kind:'Incubado',quantity:used,referenceId:incubationId,notes:`Incubación ${incubationId}`});remaining-=used;}if(!remaining)break;}return next;
}

export function findTrace(data: FarmData, query: string) {
  const rows=allTraceRows(data),key=query.trim().toLocaleLowerCase('es-CO');
  const selected=rows.find(row=>row.code.toLocaleLowerCase('es-CO')===key||row.id.toLocaleLowerCase('es-CO')===key);
  if(!selected)return [];
  const byId=new Map(rows.map(x=>[x.id,x]));
  const seen=new Set<string>();const result:typeof rows=[];
  const visit=(row:typeof selected)=>{if(seen.has(row.id))return;seen.add(row.id);for(const id of row.parentIds){const parent=byId.get(id);if(parent)visit(parent);}result.push(row);};visit(selected);return result;
}

export function makeSaleLine(input: SaleLine): SaleLine { return {...input,id:input.id||crypto.randomUUID()}; }

export function validateFarmData(data: FarmData): string[] {
  const errors:string[]=[];const rows=allTraceRows(data),codes=new Set<string>(),ids=new Set<string>();
  for(const row of rows){if(ids.has(row.id))errors.push(`ID duplicado: ${row.id}`);ids.add(row.id);if(row.code){if(codes.has(row.code))errors.push(`Código duplicado: ${row.code}`);codes.add(row.code);}}
  const has=(id:string)=>!id||ids.has(id);
  for(const lot of data.fertileLots)if(!data.eggs.some(x=>x.id===lot.sourceCollectionId)&&!lot.parentLotId)errors.push(`Lote ${lot.code} sin recolección de origen.`);
  for(const lot of data.fertileLots)if(lot.parentLotId&&!data.fertileLots.some(x=>x.id===lot.parentLotId))errors.push(`Sublote ${lot.code} con lote padre inexistente.`);
  for(const inc of data.incubations)for(const lotId of inc.sourceLotIds||[])if(!data.fertileLots.some(x=>x.id===lotId))errors.push(`Incubación ${inc.code||inc.id} referencia el lote inexistente ${lotId}.`);
  for(const birth of data.births)if(!data.incubations.some(x=>x.id===birth.incubationId))errors.push(`Nacimiento ${birth.code||birth.id} sin incubación válida.`);
  for(const lot of data.chickLots)if(!data.births.some(x=>x.id===lot.birthId)||!data.incubations.some(x=>x.id===lot.incubationId))errors.push(`Lote ${lot.code} sin nacimiento o incubación válidos.`);
  for(const sale of data.sales){if(!data.customers.some(x=>x.id===sale.customerId))errors.push(`Venta ${sale.code} sin cliente válido.`);for(const line of sale.lines){if(line.product==='Ave adulta'&&!data.birds.some(x=>x.id===line.birdId))errors.push(`Venta ${sale.code} referencia un ave inexistente.`);else if(line.product==='Pollito'&&!data.chickLots.some(x=>x.id===line.sourceLotId))errors.push(`Venta ${sale.code} referencia un lote de pollitos inexistente.`);else if(line.product!=='Ave adulta'&&line.product!=='Pollito'&&line.product!=='Otro'&&!data.fertileLots.some(x=>x.id===line.sourceLotId))errors.push(`Venta ${sale.code} referencia un lote de huevos inexistente.`);}}
  for(const row of rows)for(const parentId of row.parentIds)if(!has(parentId))errors.push(`${row.code||row.id} referencia un registro inexistente: ${parentId}.`);
  for(const movement of data.lotMovements)if((!data.fertileLots.some(x=>x.id===movement.lotId)&&!data.chickLots.some(x=>x.id===movement.lotId)&&!data.customProducts.some(x=>x.id===movement.lotId)&&!data.birds.some(x=>x.id===movement.lotId))||movement.quantity<0||(movement.quantity===0&&movement.kind!=='Clasificado'))errors.push(`Movimiento ${movement.id} tiene lote o cantidad inválidos.`);
  return [...new Set(errors)];
}

export function commercialTotals(data: FarmData, from='0000-01-01', to='9999-12-31') {
  const sales=data.sales.filter(x=>x.paymentStatus!=='Cancelada'&&x.date>=from&&x.date<=to),gross=sales.reduce((s,x)=>s+saleTotal(x)-(x.returnedTotal||0),0),paid=sales.reduce((s,x)=>s+Math.max(0,Math.min(saleTotal(x),x.paid)-(x.refunded||0)),0);
  const eggsSold=sales.flatMap(s=>s.lines).filter(x=>x.product==='Huevo fértil'||x.product==='Huevo consumo').reduce((s,x)=>s+x.quantity,0);
  const chicksSold=sales.flatMap(s=>s.lines).filter(x=>x.product==='Pollito').reduce((s,x)=>s+x.quantity,0);
  const adultBirdsSold=sales.flatMap(s=>s.lines).filter(x=>x.product==='Ave adulta').reduce((s,x)=>s+x.quantity,0);
  const incubated=data.fertileLots.reduce((s,x)=>s+x.incubated,0),hatched=data.births.filter(x=>{const inc=data.incubations.find(y=>y.id===x.incubationId);return inc&&inc.startedAt>=from&&inc.startedAt<=to;}).reduce((s,x)=>s+x.count,0);
  return {gross,paid,unpaid:Math.max(0,gross-paid),eggsSold,chicksSold,adultBirdsSold,availableEggs:data.fertileLots.reduce((s,x)=>s+x.available,0),availableChicks:data.chickLots.reduce((s,x)=>s+x.available,0),hatched,incubated,hatchRate:incubated?hatched/incubated:null};
}
