import type { Bird, BirdEvent, FarmData, RingAssignment } from '@/models/farm';
import { makeCode } from './traceability.ts';

export function normalizeRingNumber(value: string | number): number | null {
  const digits = String(value).trim().replace(/^0+(?=\d)/, '');
  if (!/^\d{1,3}$/.test(digits)) return null;
  const number = Number(digits);
  return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null;
}

export function parseRingCandidates(text: string): number[] {
  return [...new Set((text.match(/\d{1,3}/g) || []).map(normalizeRingNumber).filter((number): number is number => number !== null))];
}

export function currentRing(data: FarmData, number: number): RingAssignment | undefined {
  return data.rings.find(ring => ring.number === number && !ring.endedAt && ring.status !== 'Retirado');
}

export function assignRing(data: FarmData, number: number, birdId: string, date = new Date().toISOString().slice(0, 10)): FarmData {
  if (!normalizeRingNumber(number)) throw new Error('El número de anillo debe estar entre 1 y 100.');
  const bird = data.birds.find(item => item.id === birdId);
  if (!bird || bird.status === 'Vendido' || bird.status === 'Fallecido') throw new Error('Selecciona un ave registrada y activa.');
  const occupant = currentRing(data, number);
  if (occupant?.status === 'Temporalmente sin uso') throw new Error('Este anillo está marcado temporalmente sin uso. Actívalo antes de asignarlo.');
  if (occupant?.birdId === birdId) throw new Error(`El anillo ${number} ya está asignado a ${bird.name}.`);
  if (occupant) throw new Error(`El anillo ${number} ya está asignado a otra ave.`);
  const next = structuredClone(data);
  for (const prior of next.rings) {
    if (prior.birdId === birdId && !prior.endedAt && prior.status === 'Asignado') {
      prior.endedAt = date;
      prior.status = 'Retirado';
    }
    if (prior.number === number && !prior.endedAt && prior.status === 'Temporalmente sin uso') {
      prior.endedAt = date;
      prior.status = 'Retirado';
    }
  }
  next.rings.unshift({ id: crypto.randomUUID(), number, birdId, status: 'Asignado', assignedAt: date });
  return next;
}

export function markRingUnavailable(data: FarmData, number: number, notes = '', date = new Date().toISOString().slice(0, 10)): FarmData {
  if (!normalizeRingNumber(number)) throw new Error('El número de anillo debe estar entre 1 y 100.');
  const occupant = currentRing(data, number);
  if (occupant) throw new Error(occupant.status === 'Asignado' ? `Retira primero el anillo asignado a ${data.birds.find(bird => bird.id === occupant.birdId)?.name || 'un ave'}.` : 'Este número ya está temporalmente sin uso.');
  const next = structuredClone(data);
  next.rings.unshift({ id: crypto.randomUUID(), number, status: 'Temporalmente sin uso', assignedAt: date, notes });
  return next;
}

export function activateRing(data: FarmData, number: number, date = new Date().toISOString().slice(0, 10)): FarmData {
  const unavailable = currentRing(data, number);
  if (unavailable?.status !== 'Temporalmente sin uso') throw new Error('Este anillo no está marcado temporalmente sin uso.');
  const next = structuredClone(data);
  const record = next.rings.find(item => item.id === unavailable.id)!;
  record.status = 'Retirado';
  record.endedAt = date;
  return next;
}

export function retireBirdRing(data: FarmData, birdId: string, date = new Date().toISOString().slice(0, 10)): FarmData {
  const next = structuredClone(data);
  const assignment = next.rings.find(ring => ring.birdId === birdId && ring.status === 'Asignado' && !ring.endedAt);
  if (!assignment) throw new Error('Esta ave no tiene un anillo asignado actualmente.');
  assignment.endedAt = date;
  assignment.status = 'Retirado';
  return next;
}

export function registerBird(data: FarmData, input: Omit<Bird, 'id' | 'code'>, number: number, date = new Date().toISOString().slice(0, 10)): FarmData {
  if (!input.name.trim()) throw new Error('Escribe el nombre del ave.');
  const next = structuredClone(data);
  const id = crypto.randomUUID();
  const code = makeCode('AVE', next.birds.length + 1, id.replaceAll('-', '').slice(0, 8));
  const bird: Bird = { ...input, id, code, name: input.name.trim() };
  next.birds.unshift(bird);
  return assignRing(next, number, id, date);
}

export function appendBirdEvent(data: FarmData, input: Omit<BirdEvent, 'id'>): FarmData {
  if (!data.birds.some(bird => bird.id === input.birdId)) throw new Error('El ave seleccionada ya no existe.');
  if (!input.title.trim()) throw new Error('Escribe un título para el evento.');
  const next = structuredClone(data);
  next.birdEvents.unshift({ ...input, id: crypto.randomUUID(), title: input.title.trim() });
  return next;
}

