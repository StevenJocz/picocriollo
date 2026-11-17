'use client';
import { useState } from 'react';
import { sexLabel } from '@/models/species';
import { BirdGlyph, glyphForSex } from '@/shared/components/glyph';
import { Icon } from '@/shared/components/icon';
import type { Ancestor } from '@/server/storage/types';

// Árbol de linaje de una ave a la venta: mismo diseño que el árbol de la granja (abuelos → padres → ejemplar), más pequeño.
// Cada tarjeta dice con claridad su parentesco (madre, padre, abuela materna, abuelo paterno…). Al tocar a un padre o abuelo,
// el árbol se centra en él y muestra su ficha y sus propios padres registrados; el recorrido queda a la vista para poder volver.

type Subject = { name: string; sex: string; species?: string; breed?: string; code?: string; mother?: Ancestor; father?: Ancestor };
type Step = { subject: Subject; relation: string };

function Card({ ancestor, role, unknown, selected = false, onSelect }: { ancestor?: Ancestor | Subject; role: string; unknown: string; selected?: boolean; onSelect?: () => void }) {
  const female = ancestor?.sex === 'Gallina';
  const className = `family-card${selected ? ' family-card-selected' : ''}${ancestor ? (female ? ' lin-f' : ' lin-m') : ' family-card-unknown'}`;
  const content = (
    <>
      <span className="family-avatar"><span aria-hidden="true">{ancestor ? <BirdGlyph kind={glyphForSex(ancestor.sex)} /> : '?'}</span></span>
      <span className="family-ribbon">{role}</span>
      <strong>{ancestor?.name ?? unknown}</strong>
      <small>{ancestor ? `${sexLabel(ancestor.sex, ancestor.species)} · ${ancestor.breed || 'Raza sin definir'}` : 'No registrado'}</small>
    </>
  );
  if (ancestor && onSelect) return <button type="button" className={className} onClick={onSelect} aria-label={`${role}: ${ancestor.name}. Ver su ficha y su linaje`}>{content}</button>;
  return <div className={className} aria-current={selected ? 'true' : undefined}>{content}</div>;
}

/** Linaje declarado del ave: ella misma, sus padres y abuelos registrados. Si no hay registro lo dice con claridad. */
export function LineageTree({ name, sex, species, breed, code, genealogy }: { name: string; sex: string; species?: string; breed?: string; code?: string; genealogy?: { mother?: Ancestor; father?: Ancestor } }) {
  const root: Subject = { name, sex, species, breed, code, ...(genealogy?.mother ? { mother: genealogy.mother } : {}), ...(genealogy?.father ? { father: genealogy.father } : {}) };
  const [trail, setTrail] = useState<Step[]>([]);
  if (!genealogy) return <p className="lin-empty"><Icon name="info" size={16} />El vendedor aún no registró los padres de esta ave: su linaje no está declarado.</p>;

  const subject = trail[trail.length - 1]?.subject ?? root, focused = trail.length > 0;
  const branches = [
    { key: 'materna', title: 'Rama materna', grand: 'maternos', abuela: 'Abuela materna', abuelo: 'Abuelo materno', role: 'Madre', parent: subject.mother },
    { key: 'paterna', title: 'Rama paterna', grand: 'paternos', abuela: 'Abuela paterna', abuelo: 'Abuelo paterno', role: 'Padre', parent: subject.father },
  ] as const;
  const focus = (ancestor: Ancestor, relation: string) => setTrail(current => [...current, { subject: ancestor, relation }]);
  const ofWhom = (relation: string) => (focused ? `${relation} de ${subject.name}` : relation);

  return (
    <div className="family-tree-wrap family-compact">
      <div className="family-tree">
        <div className="lin-legend" aria-hidden="true"><span className="lin-dot lin-dot-f" />Hembra<span className="lin-dot lin-dot-m" />Macho</div>
        {focused && (
          <nav className="lin-trail" aria-label="Recorrido por el linaje">
            <button type="button" onClick={() => setTrail([])}>{name}</button>
            {trail.map((step, index) => (
              <span key={index}>
                <Icon name="arrow" size={11} />
                {index === trail.length - 1
                  ? <strong>{step.relation}: {step.subject.name}</strong>
                  : <button type="button" onClick={() => setTrail(current => current.slice(0, index + 1))}>{step.relation}: {step.subject.name}</button>}
              </span>
            ))}
          </nav>
        )}
        <div className="family-tree-title"><span className="family-tree-mark" aria-hidden="true"><Icon name="sprout" size={14} /></span><span>Linaje de</span><strong>{subject.name}</strong></div>
        <section className="family-ancestry" aria-label={`Padres y abuelos de ${subject.name}`}>
          {branches.map(branch => (
            <div className={`family-branch family-branch-${branch.key}`} key={branch.key}>
              <h4>{branch.title}</h4>
              <div className="family-grandparents">
                <Card ancestor={branch.parent?.mother} role={ofWhom(branch.abuela)} unknown={branch.abuela} onSelect={branch.parent?.mother ? () => focus(branch.parent!.mother!, branch.abuela) : undefined} />
                <Card ancestor={branch.parent?.father} role={ofWhom(branch.abuelo)} unknown={branch.abuelo} onSelect={branch.parent?.father ? () => focus(branch.parent!.father!, branch.abuelo) : undefined} />
              </div>
              <div className="family-branch-connector" aria-hidden="true" />
              <div className="family-parent"><Card ancestor={branch.parent} role={ofWhom(branch.role)} unknown={branch.role} onSelect={branch.parent ? () => focus(branch.parent!, branch.role) : undefined} /></div>
            </div>
          ))}
        </section>
        <div className="family-subject-row"><Card ancestor={subject} role={focused ? trail[trail.length - 1].relation : 'Esta ave'} unknown="" selected /></div>
        {focused && (
          <dl className="lin-facts">
            <div><dt>Parentesco</dt><dd>{trail[trail.length - 1].relation} de {trail.length > 1 ? trail[trail.length - 2].subject.name : name}</dd></div>
            <div><dt>Sexo</dt><dd>{sexLabel(subject.sex, subject.species)}</dd></div>
            <div><dt>Raza</dt><dd>{subject.breed || 'Sin definir'}</dd></div>
            {subject.code && <div><dt>Código</dt><dd>{subject.code}</dd></div>}
            <div><dt>Madre</dt><dd>{subject.mother?.name ?? 'No registrada'}</dd></div>
            <div><dt>Padre</dt><dd>{subject.father?.name ?? 'No registrado'}</dd></div>
          </dl>
        )}
        {!focused && <p className="lin-hint">Toca a la madre, al padre o a un abuelo para ver su ficha y su propio linaje.</p>}
      </div>
    </div>
  );
}
