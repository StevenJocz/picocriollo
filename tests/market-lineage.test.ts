import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing } from '../src/features/market/service/listings.ts';
import { publicView } from '../src/features/market/service/public-view.ts';
import { bird, makeEnv } from './helpers/env.ts';
import { ctx, deps } from './helpers/market.ts';

// Familia: bisabuela Gala → abuela Perla → madre Reina → Luna; padre Tizón (hijo de Bruno). Luna tiene padres, abuelos y bisabuelos registrados.
const family = () => [
  bird({ id: 'gala', name: 'Gala', sex: 'Gallina', breed: 'Brahma', status: 'Fallecido' }),
  bird({ id: 'perla', name: 'Perla', sex: 'Gallina', breed: 'Brahma', status: 'Fallecido', motherId: 'gala' }),
  bird({ id: 'reina', name: 'Reina', sex: 'Gallina', breed: 'Brahma', motherId: 'perla' }),
  bird({ id: 'bruno', name: 'Bruno', sex: 'Gallo', breed: 'Brahma', status: 'Fallecido' }),
  bird({ id: 'tizon', name: 'Tizón', sex: 'Gallo', breed: 'Brahma', fatherId: 'bruno' }),
  bird({ id: 'luna', name: 'Luna', sex: 'Gallina', breed: 'Brahma', motherId: 'reina', fatherId: 'tizon' }),
  bird({ id: 'huerfana', name: 'Huérfana', sex: 'Gallina', breed: 'Criolla' }),
];

test('el comprador ve el linaje completo: padres, abuelos y bisabuelos registrados', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: family() });
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 90000, publish: true });
    const g = publicView(listing, 'Ana').snapshot.genealogy!;
    assert.equal(g.mother?.name, 'Reina');
    assert.equal(g.mother?.mother?.name, 'Perla');
    assert.equal(g.mother?.mother?.mother?.name, 'Gala', 'bisabuela');
    assert.equal(g.father?.name, 'Tizón');
    assert.equal(g.father?.father?.name, 'Bruno');
    assert.equal(g.father?.mother, undefined, 'lo que no está registrado no se inventa');
  } finally { await env.cleanup(); }
});

test('el linaje se muestra aunque el vendedor haya desmarcado la opción: es información para decidir la compra', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: family() });
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'luna', kind: 'fixed', price: 90000, publish: true, consent: { showGenealogy: false } });
    assert.equal(publicView(listing, 'Ana').snapshot.genealogy?.mother?.name, 'Reina');
  } finally { await env.cleanup(); }
});

test('un ave sin padres registrados no muestra linaje (la ficha lo indica como «sin registrar»)', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: family() });
    const listing = await createListing(deps(env), ctx(env, ana), { birdId: 'huerfana', kind: 'fixed', price: 70000, publish: true });
    assert.equal(publicView(listing, 'Ana').snapshot.genealogy, undefined);
  } finally { await env.cleanup(); }
});
