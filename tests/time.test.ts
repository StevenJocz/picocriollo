import assert from 'node:assert/strict';
import test from 'node:test';
import { formatInZone, remaining, zonedLocalToIso } from '../src/shared/time.ts';

test('la hora local de Bogotá (UTC-5, sin horario de verano) se convierte a UTC', () => {
  assert.equal(zonedLocalToIso('2026-10-20T18:00', 'America/Bogota'), '2026-10-20T23:00:00.000Z');
  assert.equal(zonedLocalToIso('2026-01-01T00:00', 'America/Bogota'), '2026-01-01T05:00:00.000Z');
});

test('respeta el horario de verano de otras zonas', () => {
  assert.equal(zonedLocalToIso('2026-07-01T12:00', 'America/New_York'), '2026-07-01T16:00:00.000Z'); // UTC-4
  assert.equal(zonedLocalToIso('2026-01-15T12:00', 'America/New_York'), '2026-01-15T17:00:00.000Z'); // UTC-5
  assert.equal(zonedLocalToIso('2026-06-01T09:30', 'Europe/Madrid'), '2026-06-01T07:30:00.000Z'); // UTC+2
});

test('un cierre cercano al cambio de horario no se corre una hora', () => {
  // En Nueva York el 8 de marzo de 2026 se adelanta el reloj a las 02:00: 03:30 ya es UTC-4.
  assert.equal(zonedLocalToIso('2026-03-08T03:30', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  assert.equal(zonedLocalToIso('2026-03-08T01:30', 'America/New_York'), '2026-03-08T06:30:00.000Z');
});

test('rechaza formatos inválidos', () => {
  assert.equal(zonedLocalToIso('mañana', 'America/Bogota'), null);
  assert.equal(zonedLocalToIso('2026-10-20 18:00', 'America/Bogota'), null);
  assert.equal(zonedLocalToIso('2026-13-40T99:99', 'America/Bogota'), null);
});

test('formatea el mismo instante según la zona del usuario', () => {
  const iso = '2026-10-20T23:00:00.000Z';
  assert.match(formatInZone(iso, 'America/Bogota'), /0?6:00\s*p\.\s*m\./);
  assert.match(formatInZone(iso, 'Europe/Madrid'), /0?1:00\s*a\.\s*m\./);
});

test('tiempo restante legible', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  assert.equal(remaining('2026-10-16T15:00:00.000Z', now), '2 d 3 h');
  assert.equal(remaining('2026-10-14T14:20:00.000Z', now), '2 h 20 min');
  assert.equal(remaining('2026-10-14T12:45:00.000Z', now), '45 min');
  assert.equal(remaining('2026-10-14T11:00:00.000Z', now), 'Cerrada');
});
