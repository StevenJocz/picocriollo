import assert from 'node:assert/strict';
import test from 'node:test';
import { BREEDS_BY_SPECIES, SPECIES, SPECIES_LABELS, breedOptions, sexLabel, sexOptions, speciesOf } from '../src/models/species.ts';
import { browseListings, createListing } from '../src/features/market/service/listings.ts';
import { publicView } from '../src/features/market/service/public-view.ts';
import { bird, makeEnv } from './helpers/env.ts';
import { ctx, deps } from './helpers/market.ts';

test('las fichas sin especie son gallinas y los nombres del sexo cambian según la especie', () => {
  assert.equal(speciesOf(undefined), 'Gallinas');
  assert.equal(speciesOf('Dragones'), 'Gallinas');
  assert.equal(speciesOf('Patos'), 'Patos');
  assert.equal(sexLabel('Gallina', 'Patos'), 'Pata');
  assert.equal(sexLabel('Gallo', 'Gansos'), 'Ganso');
  assert.equal(sexLabel('Pollito', 'Pavos'), 'Pavito');
  assert.equal(sexLabel('Gallina', 'Codornices'), 'Hembra');
  assert.equal(sexLabel('Gallina'), 'Gallina');
  assert.equal(sexLabel('Desconocido', 'Patos'), 'Desconocido');
  assert.deepEqual(sexOptions('Patos'), [{ value: 'Gallina', label: 'Pata' }, { value: 'Gallo', label: 'Pato' }, { value: 'Pollito', label: 'Patito' }]);
});

test('cada especie tiene nombre, razas y una opción «Otra»', () => {
  for (const species of SPECIES) {
    assert.ok(SPECIES_LABELS[species], species);
    assert.ok(BREEDS_BY_SPECIES[species].includes('Otra'), `${species} sin «Otra»`);
  }
  assert.ok(breedOptions('Patos').includes('Pekín'));
  assert.ok(breedOptions('Gallinas').includes('Brahma'));
});

test('un pato se publica en el mercado con su especie, se filtra por ella y el linaje conserva la especie', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [
      bird({ id: 'madre', name: 'Pecosa', sex: 'Gallina', breed: 'Pekín', species: 'Patos' }),
      bird({ id: 'pato', name: 'Donald', sex: 'Gallo', breed: 'Pekín', species: 'Patos', motherId: 'madre' }),
      bird({ id: 'gallo', name: 'Rey', sex: 'Gallo', breed: 'Criolla' }),
    ] });
    const duck = await createListing(deps(env), ctx(env, ana), { birdId: 'pato', kind: 'fixed', price: 60000, publish: true });
    await createListing(deps(env), ctx(env, ana), { birdId: 'gallo', kind: 'fixed', price: 80000, publish: true });
    const view = publicView(duck, 'Ana').snapshot;
    assert.equal(view.species, 'Patos');
    assert.equal(view.genealogy?.mother?.species, 'Patos');
    const onlyDucks = await browseListings(env.store, { species: 'Patos' }, env.now);
    assert.deepEqual(onlyDucks.items.map(item => item.snapshot.name), ['Donald']);
    const chickens = await browseListings(env.store, { species: 'Gallinas' }, env.now);
    assert.deepEqual(chickens.items.map(item => item.snapshot.name), ['Rey'], 'las fichas sin especie cuentan como gallinas');
    assert.equal((await browseListings(env.store, {}, env.now)).total, 2);
  } finally { await env.cleanup(); }
});
