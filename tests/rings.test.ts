import assert from 'node:assert/strict';
import test from 'node:test';
import type { Bird } from '../src/models/farm.ts';
import { demoData } from '../src/features/farm/service/farm.service.ts';
import { activateRing, appendBirdEvent, assignRing, currentRing, markRingUnavailable, normalizeRingNumber, parseRingCandidates, registerBird, retireBirdRing } from '../src/features/farm/service/rings.ts';

test('normaliza anillos con ceros iniciales y limita el rango al 1–100', () => {
  assert.equal(normalizeRingNumber('001'), 1);
  assert.equal(normalizeRingNumber('07'), 7);
  assert.equal(normalizeRingNumber('0'), null);
  assert.equal(normalizeRingNumber('101'), null);
  assert.deepEqual(parseRingCandidates('Anillo 007 / 8 / 101'), [7, 8]);
});

test('impide asignar el mismo anillo a dos aves y conserva historial al cambiarlo', () => {
  const first = assignRing(structuredClone(demoData), 7, 'bird-luna', '2026-10-01');
  assert.throws(() => assignRing(first, 7, 'bird-canela', '2026-10-02'), /ya está asignado/);
  const changed = assignRing(first, 8, 'bird-luna', '2026-10-02');
  assert.equal(changed.rings.filter(item => item.birdId === 'bird-luna').length, 2);
  assert.equal(changed.rings.find(item => item.number === 7)?.status, 'Retirado');
  assert.equal(currentRing(changed, 8)?.birdId, 'bird-luna');
});

test('un número temporalmente fuera de uso se reserva hasta reactivarlo', () => {
  const unavailable = markRingUnavailable(structuredClone(demoData), 20, 'Anillo roto', '2026-10-01');
  assert.equal(currentRing(unavailable, 20)?.status, 'Temporalmente sin uso');
  assert.throws(() => assignRing(unavailable, 20, 'bird-luna'), /temporalmente sin uso/);
  const enabled = activateRing(unavailable,20,'2026-10-02');
  assert.equal(currentRing(enabled,20),undefined);
  const next = assignRing(enabled, 20, 'bird-luna', '2026-10-03');
  assert.equal(next.rings.find(item => item.number === 20)?.status, 'Asignado');
});

test('aves nuevas reciben ID interno separado del anillo y guardan su foto de perfil', () => {
  const photo = 'data:image/jpeg;base64,dGVzdA==';
  const bird: Omit<Bird, 'id'|'code'> = {name:'Prueba anillo',sex:'Gallina',breed:'Criolla',coopId:'coop-main',status:'Activo',bornAt:'',ageEstimate:'8 meses',origin:'',motherId:'',fatherId:'',photo,notes:''};
  const next = registerBird(structuredClone(demoData), bird, 33, '2026-10-03');
  const saved = next.birds.find(item => item.name === bird.name)!;
  assert.ok(saved.id);
  assert.notEqual(saved.id, '33');
  assert.equal(saved.photo, photo);
  assert.equal(currentRing(next, 33)?.birdId, saved.id);
});

test('eventos quedan asociados al ID permanente del ave', () => {
  const data = appendBirdEvent(structuredClone(demoData), {birdId:'bird-luna',kind:'Salud',date:'2026-10-04',title:'Control',details:'Revisión de rutina'});
  assert.equal(data.birdEvents[0].birdId, 'bird-luna');
  assert.throws(() => appendBirdEvent(data, {birdId:'anillo-7',kind:'Salud',date:'2026-10-04',title:'Control',details:''}), /ya no existe/);
});

test('al retirar el anillo se conserva la asignación histórica y libera el número', () => {
  const assigned = assignRing(structuredClone(demoData), 9, 'bird-luna', '2026-10-01');
  const retired = retireBirdRing(assigned, 'bird-luna', '2026-10-05');
  assert.equal(retired.rings[0].endedAt, '2026-10-05');
  assert.equal(retired.rings[0].status, 'Retirado');
  assert.equal(currentRing(retired, 9), undefined);
});
