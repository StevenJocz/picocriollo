'use client';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import type { Bird, Birth } from '@/models/farm';
import { Icon } from '@/shared/components/icon';

import { BirdGlyph, glyphForSex } from '@/shared/components/glyph';
type ParentBranch={side:'materna'|'paterna'; parentRole:'Madre'|'Padre'; parent?:Bird; grandmother?:Bird; grandfather?:Bird};
const relation=(bird?:Bird)=>bird?.sex==='Gallina'?'Gallina':bird?.sex==='Gallo'?'Gallo':'Ave';

function FamilyCard({bird,role,selected=false,onSelect,unknownLabel}:{bird?:Bird;role:string;selected?:boolean;onSelect?:(id:string)=>void;unknownLabel?:string}){
 const className=`family-card${selected?' family-card-selected':''}${bird?.photo?' family-card-photo':''}${bird?'':' family-card-unknown'}`;
 const content=<><span className="family-avatar">{bird?.photo?<Image src={bird.photo} alt={`Foto de ${bird.name}`} width={96} height={96} unoptimized/>:<span aria-hidden="true">{bird?<BirdGlyph kind={glyphForSex(bird.sex)}/>:'?'}</span>}</span><span className="family-ribbon">{role}</span><strong>{bird?.name||unknownLabel||'Sin registrar'}</strong><small>{bird?`${relation(bird)} · ${bird.breed||'Raza sin definir'}`:'Parentesco desconocido'}</small>{bird?.code&&<small className="family-code">{bird.code}</small>}</>;
 if(bird&&onSelect)return <button type="button" className={className} onClick={()=>onSelect(bird.id)} aria-label={`${role}: ${bird.name}; ${relation(bird)}, ${bird.breed}`}>{content}</button>;
 return <div className={className} aria-current={selected?'true':undefined}>{content}</div>;
}

export function GenealogyTree({birds,births}:{birds:Bird[];births:Birth[]}){
 const [selectedId,setSelectedId]=useState(()=>birds.find(b=>birds.some(child=>child.motherId===b.id||child.fatherId===b.id))?.id||birds.find(b=>b.motherId||b.fatherId)?.id||birds[0]?.id||'');
 const selected=birds.find(b=>b.id===selectedId);
 const byId=useMemo(()=>new Map(birds.map(b=>[b.id,b])),[birds]);
 if(!birds.length)return <article className="panel genealogy-panel"><div className="panel-heading"><div><span className="eyebrow">PARENTALES REGISTRADOS</span><h3>Árbol genealógico</h3></div><Icon name="heart"/></div><p>Agrega las aves y registra sus madres y padres conocidos para construir el árbol.</p></article>;
 const branches:ParentBranch[]=selected?[
  {side:'materna',parentRole:'Madre',parent:byId.get(selected.motherId),grandmother:byId.get(byId.get(selected.motherId)?.motherId||''),grandfather:byId.get(byId.get(selected.motherId)?.fatherId||'')},
  {side:'paterna',parentRole:'Padre',parent:byId.get(selected.fatherId),grandmother:byId.get(byId.get(selected.fatherId)?.motherId||''),grandfather:byId.get(byId.get(selected.fatherId)?.fatherId||'')}
 ]:[];
 const siblings=selected?birds.filter(b=>b.id!==selected.id&&((selected.motherId&&b.motherId===selected.motherId)||(selected.fatherId&&b.fatherId===selected.fatherId))):[];
 const descendantRows:Bird[][]=[];
 if(selected){let current=birds.filter(b=>b.motherId===selected.id||b.fatherId===selected.id);const seen=new Set([selected.id]);for(let depth=0;current.length&&depth<8;depth++){const row=current.filter(b=>!seen.has(b.id));if(!row.length)break;row.forEach(b=>seen.add(b.id));descendantRows.push(row);current=birds.filter(b=>row.some(parent=>b.motherId===parent.id||b.fatherId===parent.id)&&!seen.has(b.id));}}
 const relatedBirths=selected?births.filter(b=>b.motherId===selected.id||b.fatherId===selected.id):[];
 const generationName=(depth:number)=>depth===0?'Hijos':depth===1?'Nietos':depth===2?'Bisnietos':`Descendencia · ${depth+1}ª generación`;
 return <article className="panel genealogy-panel"><div className="panel-heading"><div><span className="eyebrow">PARENTALES REGISTRADOS</span><h3>Árbol genealógico</h3><p>Una vista familiar por generaciones. Selecciona cualquier ave para abrir su propio árbol.</p></div><Icon name="heart"/></div>
  <label className="form-field genealogy-selector"><span>Ver la línea familiar de</span><select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>{birds.map(b=><option key={b.id} value={b.id}>{b.name} · {b.sex} · {b.breed}</option>)}</select></label>
  {selected&&<><div className="family-tree-wrap"><div className="family-tree">
   <div className="family-tree-title"><span className="family-tree-mark" aria-hidden="true"><Icon name="sprout" size={18}/></span><span>Linaje de</span><strong>{selected.name}</strong></div>
   <section className="family-ancestry" aria-label={`Abuelos y padres de ${selected.name}`}>
    {branches.map(branch=><div className={`family-branch family-branch-${branch.side}`} key={branch.side}>
     <h4>Abuelos {branch.side==='materna'?'maternos':'paternos'}</h4>
     <div className="family-grandparents"><FamilyCard bird={branch.grandmother} role={`Abuela ${branch.side}`} unknownLabel={`Abuela ${branch.side} sin registrar`} onSelect={setSelectedId}/><FamilyCard bird={branch.grandfather} role={`Abuelo ${branch.side==='materna'?'materno':'paterno'}`} unknownLabel={`Abuelo ${branch.side==='materna'?'materno':'paterno'} sin registrar`} onSelect={setSelectedId}/></div>
     <div className="family-branch-connector" aria-hidden="true"/>
     <div className="family-parent"><FamilyCard bird={branch.parent} role={branch.parentRole} unknownLabel={`${branch.parentRole} sin registrar`} onSelect={setSelectedId}/></div>
    </div>)}
   </section>
   <div className="family-subject-row"><FamilyCard bird={selected} role="Ejemplar seleccionado" selected/>{siblings.length>0&&<div className="family-siblings"><span className="family-generation-label">Hermanos registrados</span><div>{siblings.map(b=><FamilyCard key={b.id} bird={b} role={b.sex==='Gallina'?'Hermana':b.sex==='Gallo'?'Hermano':'Hermano de camada'} onSelect={setSelectedId}/>)}</div></div>}</div>
   {descendantRows.length>0?<section className="family-descendants" aria-label={`Descendencia de ${selected.name}`}>{descendantRows.map((row,index)=><div className="family-descendant-generation" key={index}><span className="family-generation-label">{generationName(index)}</span><div>{row.map(b=><FamilyCard key={b.id} bird={b} role={b.sex==='Gallina'?'Hija':b.sex==='Gallo'?'Hijo':'Pollito'} onSelect={setSelectedId}/>)}</div></div>)}</section>:<p className="family-no-descendants">Todavía no hay hijos o nietos individuales vinculados a {selected.name}.</p>}
   </div></div>
   {relatedBirths.length>0&&<div className="genealogy-births"><strong>Nacimientos asociados</strong>{relatedBirths.map(b=><span key={b.id}>{b.count} pollitos · {b.date} · Madre: {byId.get(b.motherId)?.name||'desconocida'} · Padre: {byId.get(b.fatherId)?.name||'desconocido'}</span>)}</div>}
  </>}
 </article>;
}
