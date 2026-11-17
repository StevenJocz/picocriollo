# Mercado: lotes, fotos, perfil, opiniones y factura POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar aves individuales o lotes (aves, pollitos, huevos) con varias fotos, mostrar el perfil público del vendedor con reputación y opiniones, y emitir una factura POS al completarse cada venta.

**Architecture:** La publicación gana `itemType` + `items`; `birdId` pasa a ser la clave de recurso. Los bloqueos se manejan por `listingId` (nuevo `locks.ts`) para soportar N bloqueos por publicación. La transferencia se divide en mover aves o mover stock de lotes y cierra emitiendo comprobante `TRF-…` y factura `FAC-…` en la misma transacción. El perfil es una proyección pública de solo lectura sobre operaciones y valoraciones existentes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript estricto, `node --test` (`--experimental-strip-types`), driver de archivo / PostgreSQL por `Store`.

**Spec:** `docs/superpowers/specs/2026-10-14-mercado-lotes-perfil-facturas-design.md`

**Proyecto:** `C:\Users\Usuario\Documents\ChatGPT\Pico criollo\pico-criollo` (todas las rutas son relativas a esa carpeta). Su repo git no tiene commits: **no hay pasos de commit**; el punto de control de cada tarea es `npm test` + `npm run typecheck` en verde.

## Global Constraints

- Código bajo prueba con `node --test`: **imports relativos con extensión `.ts`**, sin alias `@/`, sin `enum` ni parameter properties (`AGENTS.md`).
- Todo cambio de negocio dentro de `store.tx(...)`; los servicios nunca tocan archivos ni SQL; las rutas API son delgadas (`src/server/api.ts` → servicio).
- Tras cambiar `src/server/storage/specs.ts` ejecutar `npm run db:migration` (una prueba falla si `database/migrations/002_market.sql` está desactualizada).
- El servidor nunca confía en datos del cliente: aves, lotes, cantidades y propiedad se leen de la granja del usuario autenticado.
- Todo dato publicado se rotula «Declarado por el vendedor»; no se afirma verificación de raza, edad, fertilidad, sexo ni salud.
- Fotos: máximo 6 por publicación, `image/png|jpeg|webp`, ≤ 3 MB decodificada cada una, ≤ 12 MB en total por petición.
- Lote de aves: 2 a 50 aves. Lote de pollitos/huevos: `quantity` entero ≥ 1 y ≤ `available` menos lo reservado por publicaciones activas.
- La factura es un documento interno: pie obligatorio «Documento interno de Pico Criollo. No es factura electrónica de venta ni documento equivalente DIAN. El pago fue confirmado por el vendedor; la plataforma no lo verifica». Sin línea de IVA («Sin IVA discriminado»).
- Datos que nunca salen en perfil, tarjetas, detalle ni factura: correo, teléfono, notas privadas, eventos sanitarios, granja, precio de ventas pasadas en el perfil, comprador de ventas pasadas en el perfil.
- Mensajes de usuario en español; código y nombres de campo como el resto del proyecto (mezcla es/en existente).

## Review Focus

Entradas y fallos que el spec implica pero que ninguna tarea cubriría por defecto; cada línea tiene su prueba en la tarea indicada.

1. Dos publicaciones del mismo lote cuya suma excede `available`, y publicar justo el remanente (Task 2: `lote_pollitos` solapados).
2. Foto inválida: base64 corrupto, tipo `image/gif`, 7 fotos, una de >3 MB (Task 5).
3. Un tercero (ni comprador ni vendedor) pidiendo una factura ajena por su número (Task 7: 403) y un número inexistente (404).
4. Perfil de un vendedor sin ventas ni opiniones: promedio 0, distribución en ceros, sin división por cero; id inexistente → 404; vendedor suspendido → sin publicaciones activas (Task 9).
5. La ficha de origen cambia después de publicar (raza del lote, ave vendida): la publicación pasa a «requiere revisión» y no se modifica en silencio; guardar la granja no puede dejar un lote con menos `available` que lo reservado (Task 2).

## File Structure

Nuevos:

| Archivo | Responsabilidad |
| --- | --- |
| `src/features/market/service/locks.ts` | Bloqueos por publicación: listar, reservar para una operación, liberar |
| `src/features/market/service/items.ts` | Tipos de ítem, `itemsOf`, validación de entrada, comprobación de fuentes, creación de bloqueos |
| `src/features/market/service/invoices.ts` | Emitir, hash, listar y leer facturas |
| `src/features/market/service/seller-profile.ts` | Proyección pública del perfil del vendedor |
| `src/app/api/market/invoices/route.ts`, `src/app/api/invoices/[number]/route.ts` | API de facturas |
| `src/app/api/market/sellers/[id]/route.ts` | API pública del perfil |
| `src/app/facturas/[number]/page.tsx`, `src/app/mercado/vendedor/[id]/page.tsx` | Páginas |
| `src/features/market/components/photo-picker.tsx`, `photo-gallery.tsx` | Subida con reducción y galería |
| `src/features/market/components/invoices-page.tsx`, `invoice-view.tsx` | «Mis facturas» y ticket |
| `src/features/market/components/seller-profile.tsx` | Perfil público |
| `tests/market-locks.test.ts`, `market-lots.test.ts`, `market-lot-transfer.test.ts`, `market-photos.test.ts`, `market-invoices.test.ts`, `market-seller-profile.test.ts` | Pruebas |

Modificados: `src/server/storage/types.ts`, `specs.ts`, `database/migrations/002_market.sql` (generado), `snapshot.ts`, `listings.ts`, `operations.ts`, `auction.ts`, `moderation.ts`, `transfer.ts`, `farm-guard.ts`, `public-view.ts`, `trust.ts`, `events.ts`, `app/api/market/listings/route.ts`, `app/api/market/route.ts`, componentes `publish-dialog`, `listing-card`, `listing-detail`, `my-listings`, `market-page`, `operation-card`, `app-shell`, `market.css`, `docs/mercado-y-notificaciones.md`, `AGENTS.md`.

---

### Task 0: Línea base

**Files:** ninguno.

- [ ] **Step 1: Ejecutar la suite actual**

Run: `npm test` y `npm run typecheck`
Expected: todo en verde (o anotar qué falla de antemano: las pruebas `store-postgres` se omiten sin `TEST_PGDATABASE`). Los fallos preexistentes no son parte de este plan; se anotan y no se tocan.

---

### Task 1: Helper de bloqueos por publicación (sin cambio de comportamiento)

Hoy cada sitio busca «el» bloqueo con `locks.list({ birdId: listing.birdId, ... }).find(...)`. Un lote de aves tendrá N bloqueos, así que todo pasa a operar por `listingId`.

**Files:**
- Create: `src/features/market/service/locks.ts`
- Modify: `src/features/market/service/listings.ts` (`releaseLock`, `withdrawListing`), `operations.ts` (`lockFor`, `respondPurchase`, `releaseOperationLocks`), `auction.ts` (`endAuction`, cancelación), `moderation.ts` (`applyListingAction`)
- Test: `tests/market-locks.test.ts`

**Interfaces:**
- Produces (`locks.ts`):
  - `activeLocks(tx: Tx, listingId: string): Promise<BirdLockRecord[]>`
  - `releaseLocks(tx: Tx, listingId: string, now: Date): Promise<void>` — marca `released` todos los activos de la publicación
  - `reserveLocks(tx: Tx, listingId: string, operationId: string): Promise<void>` — asigna `operationId`
  - `freeOperationLocks(tx: Tx, listingId: string, operationId: string): Promise<void>` — quita `operationId` de los de esa operación (siguen activos)

- [ ] **Step 1: Escribir la prueba**

```ts
// tests/market-locks.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { activeLocks, freeOperationLocks, releaseLocks, reserveLocks } from '../src/features/market/service/locks.ts';
import { makeEnv } from './helpers/env.ts';
import { publishFixed, sellerWithBird } from './helpers/market.ts';

test('los bloqueos de una publicación se reservan, liberan y sueltan como conjunto', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    const listing = await publishFixed(env, ana);
    await env.store.tx(async tx => {
      assert.equal((await activeLocks(tx, listing.id)).length, 1);
      await reserveLocks(tx, listing.id, 'op-1');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, 'op-1');
      await freeOperationLocks(tx, listing.id, 'op-otra');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, 'op-1');
      await freeOperationLocks(tx, listing.id, 'op-1');
      assert.equal((await activeLocks(tx, listing.id))[0].operationId, undefined);
      await releaseLocks(tx, listing.id, env.now);
      assert.equal((await activeLocks(tx, listing.id)).length, 0);
    });
  } finally { await env.cleanup(); }
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --experimental-strip-types --test tests/market-locks.test.ts`
Expected: FAIL («Cannot find module … locks.ts»).

- [ ] **Step 3: Crear `locks.ts`**

```ts
import type { BirdLockRecord, Tx } from '../../../server/storage/types.ts';

// Una publicación puede tener varios bloqueos (un lote de aves bloquea cada ave). Todo se opera por publicación.
export const activeLocks = (tx: Tx, listingId: string): Promise<BirdLockRecord[]> => tx.locks.list({ listingId, status: 'active' });

export async function releaseLocks(tx: Tx, listingId: string, now: Date): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) await tx.locks.update({ ...lock, status: 'released', releasedAt: now.toISOString() });
}

export async function reserveLocks(tx: Tx, listingId: string, operationId: string): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) await tx.locks.update({ ...lock, operationId });
}

export async function freeOperationLocks(tx: Tx, listingId: string, operationId: string): Promise<void> {
  for (const lock of await activeLocks(tx, listingId)) {
    if (lock.operationId !== operationId) continue;
    const free: BirdLockRecord = { ...lock };
    delete free.operationId;
    await tx.locks.update(free);
  }
}
```

- [ ] **Step 4: Sustituir los usos existentes**

En cada archivo añadir `import { activeLocks, freeOperationLocks, releaseLocks, reserveLocks } from './locks.ts';` (solo los que se usen) y aplicar:

`listings.ts` — borrar la función `releaseLock` y en `withdrawListing` cambiar `await releaseLock(tx, listing.birdId, listing.id, ctx.now);` por `await releaseLocks(tx, listing.id, ctx.now);`. Mantener `activeLock(tx, birdId)` (se sigue usando en `publishInTx`).

`operations.ts` — borrar `lockFor`. En `respondPurchase` reemplazar

```ts
const lock = await lockFor(tx, listing);
if (!lock || lock.operationId) throw new ConflictError('El ave ya está comprometida en otra operación.');
await tx.locks.update({ ...lock, operationId: op.id });
```

por

```ts
const locks = await activeLocks(tx, listing.id);
if (!locks.length || locks.some(lock => lock.operationId)) throw new ConflictError('El ave ya está comprometida en otra operación.');
await reserveLocks(tx, listing.id, op.id);
```

y `releaseOperationLocks` por

```ts
export async function releaseOperationLocks(tx: Tx, op: OperationRecord, now: Date): Promise<void> {
  const listing = await tx.listings.get(op.listingId);
  const mine = (await activeLocks(tx, op.listingId)).filter(item => item.operationId === op.id);
  if (!listing || !mine.length) return;
  if (op.origin === 'directa') {
    await freeOperationLocks(tx, listing.id, op.id);
    if (listing.status === 'en_operacion') await tx.listings.update({ ...listing, status: 'publicada', updatedAt: now.toISOString(), version: listing.version + 1 });
  } else {
    await releaseLocks(tx, listing.id, now);
    await tx.listings.update({ ...listing, status: 'cerrada_sin_ofertas', closedReason: 'operacion_cancelada', updatedAt: now.toISOString(), version: listing.version + 1 });
  }
}
```

(quitar `BirdLockRecord` del import de tipos si queda sin uso.)

`auction.ts` — en `endAuction` borrar la línea `const lock = (await tx.locks.list({ birdId: listing.birdId, status: 'active' })).find(...)`; sustituir `if (lock) await tx.locks.update({ ...lock, operationId: op.id });` por `await reserveLocks(tx, listing.id, op.id);` y `if (lock) await tx.locks.update({ ...lock, status: 'released', releasedAt: now.toISOString() });` por `await releaseLocks(tx, listing.id, now);`. En la cancelación (≈ línea 152) borrar las dos líneas de `lock` y poner `await releaseLocks(tx, listing.id, ctx.now);`.

`moderation.ts` — en `applyListingAction` borrar `const lock = …`; en la rama de retirar/rechazar sustituir `if (lock) await tx.locks.update({ ...lock, status: 'released', releasedAt: at });` por `await releaseLocks(tx, listing.id, now);`.

`transfer.ts` — de momento solo cambiar la búsqueda del bloqueo (≈ línea 37) a:

```ts
const lock = (await activeLocks(tx, listing.id)).find(item => item.operationId === op.id);
```

(importar `activeLocks`; el resto de la función se reescribe en Task 3).

- [ ] **Step 5: Ejecutar todo**

Run: `npm test` y `npm run typecheck`
Expected: PASS, mismos resultados que la línea base más la prueba nueva.

---

### Task 2: Tipos, ítems y publicación de lotes

**Files:**
- Modify: `src/server/storage/types.ts`, `specs.ts`, `src/features/market/service/snapshot.ts`, `listings.ts`, `farm-guard.ts`, `public-view.ts`
- Create: `src/features/market/service/items.ts`
- Test: `tests/market-lots.test.ts`

**Interfaces:**
- Consumes: `locks.ts` (Task 1), `findBird`, `aliasOf`, `ageLabel`, `sourceFingerprint`, `buildSnapshot`, `BLOCKED_BIRD_STATUS` (de `snapshot.ts`).
- Produces (`types.ts`):
  - `type ItemType = 'ave' | 'lote_aves' | 'lote_pollitos' | 'lote_huevos'`
  - `type ListingItem = { type: 'ave'; birdId: string } | { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number }`
  - `ListingRecord.itemType?: ItemType`, `ListingRecord.items?: ListingItem[]`
  - `BirdLockRecord.lotId?: string`, `BirdLockRecord.quantity?: number`
  - `PublicSnapshot` opcionales nuevos: `itemType?: ItemType; quantity?: number; title?: string; lotBirds?: { name: string; code: string; sex: string; breed: string; ageLabel: string }[]; fertility?: string`
- Produces (`items.ts`):
  - `ACTIVE_STATUSES`, `LOCKED_STATUSES`, `MAX_BIRDS_PER_LOT`
  - `itemTypeOf(l)`, `itemsOf(l)`, `resourceKeyOf(type, items, listingId)`
  - `parseItems(input: ItemsInput): { itemType: ItemType; items: ListingItem[] }`
  - `findLot(data: FarmJson, type: 'lote_pollitos' | 'lote_huevos', lotId: string)`
  - `reservedOf(tx, lotId, exceptListingId?): Promise<number>`
  - `assertSources(tx, userId, data, itemType, items, listingId, now, mode: 'create' | 'publish'): Promise<void>`
  - `createLocks(tx, listing, now): Promise<void>`
- Produces (`snapshot.ts`): `buildListingSnapshot(data, itemType, items, consent, sellerAlias, now): BuiltSnapshot`, `listingFingerprint(data, itemType, items): string | null`
- Produces (`listings.ts`): `ListingInput` acepta `itemType?`, `birdId?`, `birdIds?`, `lotId?`, `quantity?`; `BrowseQuery.type?`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// tests/market-lots.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { browseListings, createListing, publishListing, withdrawListing, myListings } from '../src/features/market/service/listings.ts';
import { activeLocks } from '../src/features/market/service/locks.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, flush, status } from './helpers/market.ts';

const lotFarm = {
  birds: [bird({ id: 'b1', name: 'Uno', code: 'AVE-1' }), bird({ id: 'b2', name: 'Dos', code: 'AVE-2', sex: 'Gallo' }), bird({ id: 'b3', name: 'Tres', code: 'AVE-3' })],
  births: [{ id: 'bi1', incubationId: 'i1', date: '2026-09-01', count: 20, motherId: '', fatherId: '', coopId: 'c', breed: 'Brahma', notes: '' }],
  chickLots: [{ id: 'ch1', code: 'POL-0001-AAAA1111', birthId: 'bi1', sourceLotIds: [], incubationId: 'i1', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: 'NOTA-PRIVADA-NO-PUBLICAR' }],
  fertileLots: [{ id: 'fe1', code: 'FER-0001-BBBB2222', sourceCollectionId: 'e1', productType: 'Huevo fértil', date: '2026-10-01', coopId: 'c', breed: 'Criolla', initial: 30, available: 30, sold: 0, incubated: 0, discarded: 0, fertility: 'Pendiente', storageNotes: '', notes: 'NOTA-PRIVADA-NO-PUBLICAR' }],
};
async function seller(env: TestEnv) { const ana = await env.addUser('Ana'); await env.saveFarm(ana, lotFarm); return ana; }
const create = (env: TestEnv, userId: string, input: Record<string, unknown>) => createListing(deps(env), ctx(env, userId), { kind: 'fixed', price: 100000, publish: true, ...input } as never);

test('lote de aves: publica 2+ aves con un bloqueo por ave y vista pública sin datos privados', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    assert.equal(listing.status, 'publicada');
    assert.equal(listing.snapshot.itemType, 'lote_aves');
    assert.equal(listing.snapshot.quantity, 2);
    assert.equal(listing.snapshot.title, 'Lote de 2 aves Criolla');
    assert.equal(listing.snapshot.sex, 'Mixto');
    assert.deepEqual(listing.snapshot.lotBirds?.map(b => b.name), ['Uno', 'Dos']);
    assert.ok(!JSON.stringify(listing.snapshot).includes('NOTA-PRIVADA'));
    await env.store.tx(async tx => assert.equal((await activeLocks(tx, listing.id)).length, 2));
  } finally { await env.cleanup(); }
});

test('lote de aves: rechaza menos de 2, repetidas, ajenas y más de 50; un ave inválida no deja bloqueos', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env), beto = await env.addUser('Beto');
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1'] }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b1'] }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: Array.from({ length: 51 }, (_, i) => `x${i}`) }), status(400));
    await assert.rejects(create(env, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }), status(403));
    await env.saveFarm(ana, { birds: [...lotFarm.birds.slice(0, 2), bird({ id: 'b3', name: 'Tres', status: 'Vendido' })] });
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b3'] }), status(409));
    await env.store.tx(async tx => assert.equal((await tx.locks.list({ status: 'active' })).length, 0));
    await create(env, ana, { itemType: 'ave', birdId: 'b1' });
    await assert.rejects(create(env, ana, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }), status(409));
  } finally { await env.cleanup(); }
});

test('lote de pollitos: valida cantidad y no permite que dos publicaciones superen lo disponible', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    for (const quantity of [0, -1, 1.5, '3', undefined]) await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity }), status(400));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 21 }), status(409));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'nada', quantity: 1 }), status(403));
    const first = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    assert.equal(first.snapshot.title, 'Lote de 8 pollitos Brahma');
    assert.equal(first.snapshot.quantity, 8);
    assert.equal(first.snapshot.code, 'POL-0001-AAAA1111');
    assert.match(first.snapshot.ageLabel, /días|día/);
    assert.ok(!JSON.stringify(first.snapshot).includes('NOTA-PRIVADA'));
    await assert.rejects(create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 13 }), status(409));
    const second = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 12 });
    assert.equal(second.status, 'publicada');
    await withdrawListing(deps(env), ctx(env, ana), first.id);
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
  } finally { await env.cleanup(); }
});

test('lote de huevos: publica la fertilidad tal como está declarada', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_huevos', lotId: 'fe1', quantity: 12 });
    assert.equal(listing.snapshot.title, 'Lote de 12 huevos fértiles Criolla');
    assert.equal(listing.snapshot.fertility, 'Pendiente');
    assert.equal(listing.snapshot.declaredBySeller, true);
  } finally { await env.cleanup(); }
});

test('guardar la granja no puede dejar un lote con menos disponible que lo reservado ni borrarlo', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    await assert.rejects(env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], available: 7 }] }), status(409));
    await assert.rejects(env.saveFarm(ana, { chickLots: [] }), status(409));
    await env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], available: 8 }] });
  } finally { await env.cleanup(); }
});

test('si cambia la ficha de origen de un lote la publicación pide revisión sin modificarse', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    const listing = await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    await env.saveFarm(ana, { chickLots: [{ ...lotFarm.chickLots[0], breed: 'Cubana' }] });
    const mine = (await myListings(env.store, ana)).find(row => row.id === listing.id)!;
    assert.equal(mine.needsReview, true);
    assert.equal(mine.snapshot.breed, 'Brahma');
    await flush(env);
  } finally { await env.cleanup(); }
});

test('el catálogo filtra por tipo y las publicaciones antiguas cuentan como «ave»', async () => {
  const env = await makeEnv();
  try {
    const ana = await seller(env);
    await create(env, ana, { itemType: 'ave', birdId: 'b1' });
    await create(env, ana, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 5 });
    assert.equal((await browseListings(env.store, {})).total, 2);
    assert.equal((await browseListings(env.store, { type: 'lote_pollitos' })).total, 1);
    assert.equal((await browseListings(env.store, { type: 'ave' })).total, 1);
    await env.store.tx(async tx => { const row = (await tx.listings.list({ sellerId: ana })).find(l => l.itemType === 'ave')!; const legacy = { ...row }; delete legacy.itemType; delete legacy.items; await tx.listings.update(legacy); });
    assert.equal((await browseListings(env.store, { type: 'ave' })).total, 1);
  } finally { await env.cleanup(); }
});
```

(`publishListing` y `flush` importados pero opcionales: quitar los que el linter marque sin uso.)

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test tests/market-lots.test.ts`
Expected: FAIL (no existe `items.ts`, el servicio ignora `itemType`).

- [ ] **Step 3: `types.ts`**

Añadir tras `ListingKind`:

```ts
export type ItemType = 'ave' | 'lote_aves' | 'lote_pollitos' | 'lote_huevos';
export type ListingItem = { type: 'ave'; birdId: string } | { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number };
```

En `PublicSnapshot` añadir (antes de `declaredBySeller`):

```ts
  itemType?: ItemType; quantity?: number; title?: string; fertility?: string;
  lotBirds?: { name: string; code: string; sex: string; breed: string; ageLabel: string }[];
```

En `ListingRecord` añadir `itemType?: ItemType; items?: ListingItem[];` junto a `birdId`. En `BirdLockRecord` añadir `lotId?: string; quantity?: number;`.

En `specs.ts` cambiar los índices de `locks` a `index: ['listingId', 'operationId', 'lotId']`, y ejecutar `npm run db:migration`.

- [ ] **Step 4: `items.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { ChickLot, FarmData, FertileEggLot } from '../../../models/farm.ts';
import { ConflictError, ForbiddenError, ValidationError } from '../../../server/errors.ts';
import type { ItemType, ListingItem, ListingRecord, ListingStatus, Tx } from '../../../server/storage/types.ts';
import { BLOCKED_BIRD_STATUS, findBird } from './snapshot.ts';
import type { FarmJson } from './snapshot.ts';

export const ACTIVE_STATUSES: ListingStatus[] = ['borrador', 'publicada', 'pausada', 'en_operacion'];
/** Estados en los que la publicación ya tiene bloqueos activos. */
export const LOCKED_STATUSES: ListingStatus[] = ['publicada', 'pausada', 'en_operacion'];
export const MAX_BIRDS_PER_LOT = 50;
const ITEM_TYPES: ItemType[] = ['ave', 'lote_aves', 'lote_pollitos', 'lote_huevos'];

type Shape = Pick<ListingRecord, 'birdId'> & Partial<Pick<ListingRecord, 'itemType' | 'items'>>;
export const itemTypeOf = (listing: Pick<ListingRecord, 'itemType'>): ItemType => listing.itemType ?? 'ave';
export const itemsOf = (listing: Shape): ListingItem[] => listing.items ?? [{ type: 'ave', birdId: listing.birdId }];
/** Clave de recurso que va en `birdId`: el id del ave, o `lote:<id de la publicación>`. */
export const resourceKeyOf = (type: ItemType, items: ListingItem[], listingId: string): string => (type === 'ave' ? (items[0] as { birdId: string }).birdId : `lote:${listingId}`);

export interface ItemsInput { itemType?: unknown; birdId?: unknown; birdIds?: unknown; lotId?: unknown; quantity?: unknown; }

export function parseItems(input: ItemsInput): { itemType: ItemType; items: ListingItem[] } {
  const itemType = (input.itemType ?? 'ave') as ItemType;
  if (!ITEM_TYPES.includes(itemType)) throw new ValidationError('Tipo de publicación no válido.');
  if (itemType === 'ave') {
    if (typeof input.birdId !== 'string' || !input.birdId) throw new ValidationError('Selecciona un ave.');
    return { itemType, items: [{ type: 'ave', birdId: input.birdId }] };
  }
  if (itemType === 'lote_aves') {
    const ids = input.birdIds;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id)) throw new ValidationError('Selecciona las aves del lote.');
    const unique = [...new Set(ids as string[])];
    if (unique.length !== ids.length) throw new ValidationError('Hay aves repetidas en el lote.');
    if (unique.length < 2) throw new ValidationError('Un lote de aves necesita al menos 2 aves. Para una sola ave usa «Un ave».');
    if (unique.length > MAX_BIRDS_PER_LOT) throw new ValidationError(`Un lote de aves admite como máximo ${MAX_BIRDS_PER_LOT} aves.`);
    return { itemType, items: unique.map(birdId => ({ type: 'ave' as const, birdId })) };
  }
  if (typeof input.lotId !== 'string' || !input.lotId) throw new ValidationError('Selecciona el lote.');
  const quantity = input.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) throw new ValidationError('La cantidad debe ser un número entero mayor que 0.');
  return { itemType, items: [{ type: itemType, lotId: input.lotId, quantity }] };
}

export function findLot(data: FarmJson, type: 'lote_pollitos' | 'lote_huevos', lotId: string): ChickLot | FertileEggLot | undefined {
  const farm = data as unknown as FarmData;
  return type === 'lote_pollitos' ? farm.chickLots?.find(lot => lot.id === lotId) : farm.fertileLots?.find(lot => lot.id === lotId);
}

/** Unidades de un lote ya comprometidas por publicaciones con bloqueo activo. */
export async function reservedOf(tx: Tx, lotId: string, exceptListingId?: string): Promise<number> {
  return (await tx.locks.list({ lotId, status: 'active' })).filter(lock => lock.listingId !== exceptListingId).reduce((sum, lock) => sum + (lock.quantity ?? 0), 0);
}

/** Comprueba la propiedad registrada de un ave; si aún no figura en el registro, la inscribe a nombre del usuario. */
export async function assertOwnsBird(tx: Tx, userId: string, farmData: FarmJson, birdId: string, now: Date) {
  if (!findBird(farmData, birdId)) throw new ForbiddenError('Solo puedes publicar aves de tu propia granja.');
  const registered = await tx.ownership.get(birdId);
  if (registered && registered.ownerId !== userId) throw new ForbiddenError('Solo puedes publicar aves de tu propia granja.');
  if (!registered) {
    const at = now.toISOString();
    await tx.ownership.insert({ id: birdId, ownerId: userId, since: at, version: 1 });
    await tx.ownershipHistory.insert({ id: `${birdId}:${at}`, birdId, ownerId: userId, from: at });
  }
}

async function usedByOtherListing(tx: Tx, sellerId: string, birdId: string, exceptListingId: string): Promise<boolean> {
  return (await tx.listings.list({ sellerId })).some(row => row.id !== exceptListingId && ACTIVE_STATUSES.includes(row.status) && itemsOf(row).some(item => item.type === 'ave' && item.birdId === birdId));
}

/**
 * Valida en el servidor que cada fuente (ave o lote) es del vendedor y está disponible.
 * `create` valida al crear el borrador; `publish` revalida al bloquear y publica (los errores son de conflicto).
 */
export async function assertSources(tx: Tx, userId: string, data: FarmJson, itemType: ItemType, items: ListingItem[], listingId: string, now: Date, mode: 'create' | 'publish'): Promise<void> {
  for (const item of items) {
    if (item.type === 'ave') {
      if (mode === 'create') await assertOwnsBird(tx, userId, data, item.birdId, now);
      const bird = findBird(data, item.birdId);
      if (!bird) throw new ConflictError('El ave ya no existe en tu granja.');
      if (BLOCKED_BIRD_STATUS.includes(bird.status)) throw new ConflictError(`El ave está ${bird.status.toLowerCase()} y no se puede publicar.`);
      if (mode === 'create' && await usedByOtherListing(tx, userId, item.birdId, listingId)) throw new ConflictError(itemType === 'ave' ? 'Esta ave ya tiene una publicación. Edítala o retírala primero.' : `«${bird.name}» ya tiene una publicación. Retírala antes de incluirla en un lote.`);
      if (mode === 'publish' && (await tx.locks.list({ birdId: item.birdId, status: 'active' })).length) throw new ConflictError('Esta ave ya tiene una publicación activa o una operación pendiente.');
      continue;
    }
    const lot = findLot(data, item.type, item.lotId);
    if (!lot) throw mode === 'create' ? new ForbiddenError('Solo puedes publicar lotes de tu propia granja.') : new ConflictError('El lote ya no existe en tu granja.');
    const free = lot.available - await reservedOf(tx, item.lotId, listingId);
    if (item.quantity > free) throw new ConflictError(`Solo quedan ${Math.max(free, 0)} unidades disponibles en ese lote.`);
  }
}

export async function createLocks(tx: Tx, listing: ListingRecord, now: Date): Promise<void> {
  const createdAt = now.toISOString();
  for (const item of itemsOf(listing)) {
    if (item.type === 'ave') await tx.locks.insert({ id: randomUUID(), birdId: item.birdId, listingId: listing.id, status: 'active', createdAt });
    else await tx.locks.insert({ id: randomUUID(), birdId: listing.birdId, listingId: listing.id, lotId: item.lotId, quantity: item.quantity, status: 'active', createdAt });
  }
}
```

- [ ] **Step 5: `snapshot.ts` — constructores por tipo y huella**

Añadir al final del archivo (importar `findLot`/`itemsOf` **no**: `items.ts` importa de `snapshot.ts`, así que `snapshot.ts` recibe `ListingItem[]` y busca lotes con su propia función local para evitar el ciclo):

```ts
import type { ChickLot, FertileEggLot } from '../../../models/farm.ts';
import type { ItemType, ListingItem } from '../../../server/storage/types.ts';

function lotIn(data: FarmJson, type: 'lote_pollitos' | 'lote_huevos', lotId: string): ChickLot | FertileEggLot | undefined {
  const farm = farmOf(data);
  return type === 'lote_pollitos' ? farm.chickLots?.find(lot => lot.id === lotId) : farm.fertileLots?.find(lot => lot.id === lotId);
}

/** Misma huella que `sourceFingerprint` para un ave; para lotes, combina las fuentes. Null si alguna ya no existe. */
export function listingFingerprint(data: FarmJson, itemType: ItemType, items: ListingItem[]): string | null {
  if (itemType === 'ave' || itemType === 'lote_aves') {
    const parts = items.map(item => (item.type === 'ave' ? sourceFingerprint(data, item.birdId) : null));
    if (parts.some(part => part === null)) return null;
    return itemType === 'ave' ? parts[0] : sha(JSON.stringify(parts));
  }
  const item = items[0];
  if (item.type === 'ave') return null;
  const lot = lotIn(data, item.type, item.lotId);
  if (!lot) return null;
  return sha(JSON.stringify({ code: lot.code, breed: lot.breed, enough: lot.available >= item.quantity, fertility: 'fertility' in lot ? lot.fertility : null, productType: 'productType' in lot ? lot.productType ?? null : null }));
}

function lotSnapshotBase(consent: ListingConsent, sellerAlias: string): Pick<PublicSnapshot, 'description' | 'deliveryZone' | 'declaredBySeller'> & Partial<Pick<PublicSnapshot, 'healthNote' | 'breeder'>> {
  return {
    description: consent.description, deliveryZone: consent.deliveryZone, declaredBySeller: true,
    ...(consent.healthNote ? { healthNote: consent.healthNote } : {}),
    ...(consent.showBreeder ? { breeder: consent.breederAlias || sellerAlias } : {}),
  };
}

export function buildListingSnapshot(data: FarmJson, itemType: ItemType, items: ListingItem[], consent: ListingConsent, sellerAlias: string, now: Date): BuiltSnapshot {
  if (itemType === 'ave') return buildSnapshot(data, (items[0] as { birdId: string }).birdId, consent, sellerAlias, now);
  const sourceHash = listingFingerprint(data, itemType, items);
  if (sourceHash === null) throw new ValidationError('Una de las fuentes de la publicación ya no existe en la ficha.');
  if (itemType === 'lote_aves') {
    const birds = items.map(item => findBird(data, (item as { birdId: string }).birdId)!);
    const breeds = [...new Set(birds.map(bird => bird.breed))], sexes = [...new Set(birds.map(bird => bird.sex))];
    const title = `Lote de ${birds.length} aves${breeds.length === 1 ? ` ${breeds[0]}` : ''}`;
    return {
      sourceHash,
      snapshot: {
        name: title, title, itemType, quantity: birds.length, code: '', ring: null, breed: breeds.length === 1 ? breeds[0] : 'Mixta', sex: sexes.length === 1 ? sexes[0] : 'Mixto', bornAt: '', ageLabel: '',
        lotBirds: birds.map(bird => ({ name: bird.name, code: bird.code ?? '', sex: bird.sex, breed: bird.breed, ageLabel: ageLabel(bird.bornAt, bird.ageEstimate, now) })),
        ...lotSnapshotBase(consent, sellerAlias),
      },
    };
  }
  const item = items[0] as { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number };
  const lot = lotIn(data, item.type, item.lotId)!;
  const farm = farmOf(data);
  const unit = item.type === 'lote_pollitos' ? 'pollitos' : (lot as FertileEggLot).productType === 'Huevo consumo' ? 'huevos de consumo' : 'huevos fértiles';
  const title = `Lote de ${item.quantity} ${unit}${lot.breed ? ` ${lot.breed}` : ''}`;
  const bornAt = item.type === 'lote_pollitos' ? farm.births?.find(birth => birth.id === (lot as ChickLot).birthId)?.date ?? '' : '';
  return {
    sourceHash,
    snapshot: {
      name: title, title, itemType: item.type, quantity: item.quantity, code: lot.code, ring: null, breed: lot.breed || 'No registrada', sex: 'Mixto', bornAt,
      ageLabel: bornAt ? ageLabel(bornAt, undefined, now) : '',
      ...(item.type === 'lote_huevos' ? { fertility: (lot as FertileEggLot).fertility } : {}),
      ...lotSnapshotBase(consent, sellerAlias),
    },
  };
}
```

- [ ] **Step 6: `listings.ts`**

1. Imports: quitar `findBird`/`buildSnapshot`/`sourceFingerprint` si ya no se usan; importar `{ ACTIVE_STATUSES, assertSources, createLocks, itemTypeOf, itemsOf, parseItems, resourceKeyOf }` de `./items.ts`, `{ buildListingSnapshot, listingFingerprint }` de `./snapshot.ts`, `{ releaseLocks }` de `./locks.ts`. Borrar la `const ACTIVE_STATUSES` local y la función `assertOwnsBird` local; añadir `export { ACTIVE_STATUSES } from './items.ts';` por compatibilidad.
2. `ListingInput`:

```ts
export interface ListingInput {
  itemType?: ItemType; birdId?: string; birdIds?: string[]; lotId?: string; quantity?: number;
  kind: ListingKind; price?: number; terms?: string; consent?: Record<string, unknown>; publish?: boolean; auction?: AuctionInput;
}
```

3. `fillSnapshot`: `const built = buildListingSnapshot(farmData, itemTypeOf(listing), itemsOf(listing), listing.consent, aliasOf(seller), ctx.now);`
4. `publishInTx`: sustituir desde `const bird = findBird(...)` hasta el `if (await activeLock(...))` por:

```ts
  await assertSources(tx, listing.sellerId, farm.data, itemTypeOf(listing), itemsOf(listing), listing.id, ctx.now, 'publish');
```

   y sustituir el `tx.locks.insert({...})` por `await createLocks(tx, listing, ctx.now);`. Borrar `activeLock` si queda sin uso.
5. `createListing`: sustituir la validación de `birdId` y el bloque de ave por

```ts
  const { itemType, items } = parseItems(input);
  ...
  return deps.store.tx(async tx => {
    await assertActive(tx, ctx.userId);
    await assertRate(tx, ctx.userId, 'listing.create', ctx.now);
    const farm = await tx.farms.get(ctx.userId);
    if (!farm) throw new NotFoundError('No existe tu granja.');
    const id = randomUUID();
    await assertSources(tx, ctx.userId, farm.data, itemType, items, id, ctx.now, 'create');
    const at = ctx.now.toISOString();
    const listing: ListingRecord = {
      id, birdId: resourceKeyOf(itemType, items, id), itemType, items, sellerId: ctx.userId, kind: input.kind, status: 'borrador', consent: normalizeConsent(input.consent),
      snapshot: undefined as never, sourceHash: '', needsReview: false, price, currency: 'COP', terms, createdAt: at, updatedAt: at, version: 1,
      ...(auctionData ? { auction: auctionData.rules, opensAt: auctionData.opensAt, closesAt: auctionData.closesAt } : {}),
    };
```

   (el resto igual: `fillSnapshot`, insert, audit con `{ kind, itemType }`, `publishInTx` si `input.publish`).
6. `refreshSnapshot`: reemplazar la comprobación `findBird` por `if (listingFingerprint(farm.data, itemTypeOf(listing), itemsOf(listing)) === null) throw new ConflictError('Una fuente de la publicación ya no existe en tu granja. Retira la publicación.');`
7. `flagListingsForReview`: `const current = listingFingerprint(nextData, itemTypeOf(listing), itemsOf(listing));`
8. `BrowseQuery` añade `type?: string`; en `browseListings` añadir `.filter(row => !query.type || itemTypeOf(row) === query.type)` y ampliar el texto buscable con `${row.snapshot.title ?? ''}`.
9. En `OwnListing`/`myListings` no cambia nada (`birdId` sigue siendo la clave de recurso).

- [ ] **Step 7: `public-view.ts`**

En `PublicListing.snapshot` ya se hereda de `PublicSnapshot`; añadir a la proyección de `publicView` (dentro de `snapshot: { ... }`):

```ts
      ...(s.itemType ? { itemType: s.itemType } : {}),
      ...(s.quantity !== undefined ? { quantity: s.quantity } : {}),
      ...(s.title ? { title: s.title } : {}),
      ...(s.lotBirds ? { lotBirds: s.lotBirds } : {}),
      ...(s.fertility ? { fertility: s.fertility } : {}),
```

- [ ] **Step 8: `farm-guard.ts` — lotes reservados**

Importar `{ LOCKED_STATUSES, itemsOf }` de `./items.ts` y `FarmData` ya está. En `guardFarmSave`, después del bucle que revisa las aves eliminadas, añadir:

```ts
  const reserved = new Map<string, number>();
  for (const listing of await tx.listings.list({ sellerId: userId })) {
    if (!LOCKED_STATUSES.includes(listing.status)) continue;
    for (const item of itemsOf(listing)) if (item.type !== 'ave') reserved.set(item.lotId, (reserved.get(item.lotId) ?? 0) + item.quantity);
  }
  if (reserved.size) {
    const lots = [...((next as unknown as FarmData).chickLots ?? []), ...((next as unknown as FarmData).fertileLots ?? [])];
    for (const [lotId, quantity] of reserved) {
      const lot = lots.find(item => item.id === lotId);
      if (!lot) throw new ConflictError('Un lote reservado en el mercado no se puede eliminar. Retira la publicación antes.');
      if (lot.available < quantity) throw new ConflictError(`El lote ${lot.code} tiene ${quantity} unidades en el mercado: no puedes dejar menos disponibles. Retira la publicación antes.`);
    }
  }
```

- [ ] **Step 9: Ejecutar**

Run: `node --experimental-strip-types --test tests/market-lots.test.ts` → PASS.
Run: `npm test` y `npm run typecheck` y `npm run db:migration` (y repetir `npm test`: la prueba de migración debe pasar) → PASS.

---

### Task 3: Transferencia de lotes

**Files:**
- Modify: `src/features/market/service/transfer.ts`
- Test: `tests/market-lot-transfer.test.ts`

**Interfaces:**
- Consumes: `activeLocks`/`releaseLocks`/`freeOperationLocks` (Task 1); `itemTypeOf`, `itemsOf` (Task 2).
- Produces: `executeTransfer(tx, op, now): Promise<TransferReceiptRecord>` sigue con la misma firma; ahora soporta los 4 tipos. El comprobante de un lote lleva `birdId = listing.birdId`, `birdName = snapshot.title`, `birdCode = código del lote o ''`, `ring = null`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// tests/market-lot-transfer.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmData } from '../src/models/farm.ts';
import { createListing } from '../src/features/market/service/listings.ts';
import { activeLocks } from '../src/features/market/service/locks.ts';
import { cancelOperation, confirmPayment, confirmReceipt, declarePayment, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

const chick = { id: 'ch1', code: 'POL-0001-AAAA1111', birthId: 'bi1', sourceLotIds: [], incubationId: 'i1', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: '' };
const eggs = { id: 'fe1', code: 'FER-0001-BBBB2222', sourceCollectionId: 'e1', productType: 'Huevo fértil', date: '2026-10-01', coopId: 'c', breed: 'Criolla', initial: 30, available: 30, sold: 0, incubated: 0, discarded: 0, fertility: 'Confirmada', storageNotes: '', notes: '' };

async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { birds: [bird({ id: 'b1', name: 'Uno' }), bird({ id: 'b2', name: 'Dos' })], chickLots: [chick], fertileLots: [eggs] });
  return { ana, beto };
}
async function toDelivered(env: TestEnv, ana: string, beto: string, input: Record<string, unknown>) {
  const listing = await createListing(deps(env), ctx(env, ana), { kind: 'fixed', price: 120000, publish: true, ...input } as never);
  const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
  await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
  await declarePayment(env.store, ctx(env, beto), op.id, 'Efectivo');
  await confirmPayment(env.store, ctx(env, ana), op.id);
  await markDelivered(env.store, ctx(env, ana), op.id);
  return { listing, op };
}

test('lote de pollitos: descuenta al vendedor y crea un lote nuevo en la granja del comprador', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { listing, op } = await toDelivered(env, ana, beto, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 });
    const done = await confirmReceipt(env.store, ctx(env, beto), op.id);
    assert.match(done.receiptCode, /^TRF-/);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(seller.chickLots[0].available, 12); assert.equal(seller.chickLots[0].sold, 8);
    assert.equal(seller.lotMovements[0].kind, 'Vendido'); assert.equal(seller.lotMovements[0].referenceId, op.id);
    assert.equal(buyer.chickLots.length, 1);
    assert.equal(buyer.chickLots[0].available, 8); assert.equal(buyer.chickLots[0].initial, 8); assert.equal(buyer.chickLots[0].coopId, '');
    assert.match(buyer.chickLots[0].code, /^POL-\d{4}-[A-Z0-9]{8}$/);
    assert.notEqual(buyer.chickLots[0].code, seller.chickLots[0].code);
    await env.store.tx(async tx => {
      assert.equal((await tx.listings.get(listing.id))!.status, 'vendida');
      assert.equal((await activeLocks(tx, listing.id)).length, 0);
    });
    await env.saveFarm(ana, { chickLots: [{ ...seller.chickLots[0], available: 2 }] }); // ya no hay reserva
  } finally { await env.cleanup(); }
});

test('lote de huevos conserva la fertilidad declarada y se descuenta', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await toDelivered(env, ana, beto, { itemType: 'lote_huevos', lotId: 'fe1', quantity: 12 });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.equal(seller.fertileLots[0].available, 18);
    assert.equal(buyer.fertileLots[0].available, 12); assert.equal(buyer.fertileLots[0].fertility, 'Confirmada'); assert.equal(buyer.fertileLots[0].productType, 'Huevo fértil');
  } finally { await env.cleanup(); }
});

test('lote de aves: transfiere todas las aves; si una falla no se mueve ninguna', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { listing, op } = await toDelivered(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    const other = await env.addUser('Carla');
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: other }); });
    await assert.rejects(confirmReceipt(env.store, ctx(env, beto), op.id), status(409));
    assert.equal(((await env.farm(beto)) as unknown as FarmData).birds.length, 0);
    await env.store.tx(async tx => { assert.notEqual((await tx.operations.get(op.id))!.status, 'completada'); assert.equal((await tx.listings.get(listing.id))!.status, 'en_operacion'); });
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: ana }); });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const seller = (await env.farm(ana)) as unknown as FarmData, buyer = (await env.farm(beto)) as unknown as FarmData;
    assert.deepEqual(buyer.birds.map(b => b.id).sort(), ['b1', 'b2']);
    assert.ok(seller.birds.every(b => b.status === 'Transferido'));
    await env.store.tx(async tx => { assert.equal((await tx.ownership.get('b1'))!.ownerId, beto); assert.equal((await tx.ownership.get('b2'))!.ownerId, beto); });
  } finally { await env.cleanup(); }
});

test('cancelar una operación de lote libera la reserva y deja la publicación disponible', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const listing = await createListing(deps(env), ctx(env, ana), { kind: 'fixed', price: 90000, publish: true, itemType: 'lote_aves', birdIds: ['b1', 'b2'] } as never);
    const op = await requestPurchase(env.store, ctx(env, beto), listing.id);
    await respondPurchase(env.store, ctx(env, ana), op.id, 'accept');
    await cancelOperation(env.store, ctx(env, ana), op.id, 'No hubo acuerdo de entrega');
    await env.store.tx(async tx => {
      const locks = await activeLocks(tx, listing.id);
      assert.equal(locks.length, 2); assert.ok(locks.every(l => l.operationId === undefined));
      assert.equal((await tx.listings.get(listing.id))!.status, 'publicada');
    });
  } finally { await env.cleanup(); }
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test tests/market-lot-transfer.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `executeTransfer` en `transfer.ts`**

Conservar `receiptCode`, `ReceiptContent`, `receiptHash`, `ancestors`, `verifyReceipt`, `getReceipt`, `getProvenance` tal como están. Añadir imports `{ activeLocks, releaseLocks } from './locks.ts'`, `{ itemTypeOf, itemsOf } from './items.ts'`, tipos `ChickLot`, `FertileEggLot`. Sustituir `executeTransfer` por:

```ts
const STOCK_KEYS = ['chickLots', 'fertileLots', 'lotMovements'] as const;
function ensureStock(farm: FarmData) { for (const key of STOCK_KEYS) if (!Array.isArray(farm[key])) (farm as unknown as Record<string, unknown[]>)[key] = []; }

/** Código de lote para la granja del comprador (mismo formato PREFIJO-0001-TOKEN8 que el resto de códigos). */
function lotCode(prefix: 'POL' | 'FER', taken: Set<string>): string {
  let ordinal = taken.size + 1, code = '';
  do { code = `${prefix}-${String(ordinal++).padStart(4, '0')}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; } while (taken.has(code));
  return code;
}

interface Moved { birdId: string; ring: number | null; ringKept: boolean; sharedHistory: number; }

/** Mueve un ave de la granja del vendedor a la del comprador (anillo, historial autorizado, lápida, propiedad y pasaporte). */
async function moveBird(tx: Tx, op: OperationRecord, listing: ListingRecord, sFarm: FarmData, bFarm: FarmData, birdId: string, sellerAlias: string, today: string, at: string): Promise<Moved> {
  const ownership = await tx.ownership.get(birdId);
  if (!ownership || ownership.ownerId !== op.sellerId) throw new ConflictError('El vendedor ya no es el propietario actual del ave: la transferencia se bloqueó.');
  const bird = sFarm.birds.find(item => item.id === birdId);
  if (!bird) throw new ConflictError('El ave ya no existe en la granja del vendedor.');
  if (['Vendido', 'Fallecido', 'Transferido'].includes(bird.status)) throw new ConflictError(`El ave está ${bird.status.toLowerCase()} y no se puede transferir.`);
  if (bFarm.birds.some(item => item.id === bird.id)) throw new ConflictError('El comprador ya tiene registrada esta ave.');

  const currentRing = sFarm.rings.find(ring => ring.birdId === bird.id && ring.status === 'Asignado' && !ring.endedAt);
  const ringHistory = sFarm.rings.filter(ring => ring.birdId === bird.id).map(ring => ({ number: ring.number, assignedAt: ring.assignedAt, endedAt: ring.endedAt ?? null }));
  let ringNote = '';
  if (currentRing) {
    const taken = bFarm.rings.some(ring => ring.number === currentRing.number && ring.status !== 'Retirado' && !ring.endedAt);
    if (taken) ringNote = `Anillo ${currentRing.number} pendiente de reasignar: ese número ya está en uso en tu granja. El número original quedó en el pasaporte del ave.`;
    else bFarm.rings.unshift({ id: `ring-${randomUUID()}`, number: currentRing.number, birdId: bird.id, status: 'Asignado', assignedAt: today, notes: `Anillo original conservado en la transferencia desde ${sellerAlias}.` } satisfies RingAssignment);
    currentRing.status = 'Retirado'; currentRing.endedAt = today; currentRing.notes = 'Retirado por transferencia de propiedad.';
  }

  const consent = listing.consent;
  const sharedKinds = [...(consent.shareHistoryReproductive ? ['Reproductivo'] : []), ...(consent.shareHistoryHealth ? ['Salud'] : [])];
  const history: BirdEvent[] = sFarm.birdEvents.filter(event => event.birdId === bird.id && sharedKinds.includes(event.kind)).map(event => ({ ...event, id: `evt-${randomUUID()}`, transferredFrom: sellerAlias }));
  bFarm.birdEvents.unshift(...history);

  const moved: Bird = { ...bird, coopId: '', status: 'Activo', notes: ringNote, origin: `Transferida por ${sellerAlias} el ${today}. Procedencia declarada: ${bird.origin || 'sin dato'}` };
  bFarm.birds.unshift(moved);
  sFarm.birds[sFarm.birds.findIndex(item => item.id === bird.id)] = { ...bird, status: 'Transferido' };

  for (const row of await tx.ownershipHistory.list({ birdId: bird.id })) if (!row.to && row.ownerId === op.sellerId) await tx.ownershipHistory.update({ ...row, to: at });
  await tx.ownershipHistory.insert({ id: `${bird.id}:${at}:${op.buyerId.slice(0, 8)}`, birdId: bird.id, ownerId: op.buyerId, from: at, operationId: op.id });
  await tx.ownership.update({ ...ownership, ownerId: op.buyerId, since: at, version: ownership.version + 1 });
  const passport = (await tx.passports.list({ birdId: bird.id }))[0];
  const lineage = { mother: ancestors(sFarm, bird.motherId, 2) ?? null, father: ancestors(sFarm, bird.fatherId, 2) ?? null, ringHistory, birthDate: bird.bornAt, breed: bird.breed, declaredBy: sellerAlias };
  if (passport) await tx.passports.update({ ...passport, originRing: passport.originRing ?? currentRing?.number ?? null, lineage: { ...passport.lineage, ...lineage }, updatedAt: at });
  else await tx.passports.insert({ id: `passport-${bird.id}`, birdId: bird.id, code: bird.code ?? '', originRing: currentRing?.number ?? null, lineage, updatedAt: at });
  return { birdId: bird.id, ring: currentRing?.number ?? null, ringKept: Boolean(currentRing) && !ringNote, sharedHistory: history.length };
}

/** Descuenta la cantidad del lote del vendedor y crea un lote nuevo, sin coop, en la granja del comprador. */
function moveStock(op: OperationRecord, sFarm: FarmData, bFarm: FarmData, item: { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number }, sellerAlias: string, buyerAlias: string, today: string): { code: string } {
  const lots = (item.type === 'lote_pollitos' ? sFarm.chickLots : sFarm.fertileLots) as (ChickLot | FertileEggLot)[];
  const lot = lots.find(row => row.id === item.lotId);
  if (!lot) throw new ConflictError('El lote ya no existe en la granja del vendedor.');
  if (lot.available < item.quantity) throw new ConflictError('El lote ya no tiene la cantidad publicada: la transferencia se bloqueó.');
  lot.available -= item.quantity; lot.sold += item.quantity;
  sFarm.lotMovements.unshift({ id: `mov-${randomUUID()}`, date: today, lotId: lot.id, kind: 'Vendido', quantity: item.quantity, referenceId: op.id, notes: `Venta en el mercado a ${buyerAlias}` });
  const taken = new Set([...bFarm.chickLots, ...bFarm.fertileLots].map(row => row.code));
  const notes = `Transferido por ${sellerAlias} el ${today}. Datos del lote declarados por el vendedor.`;
  if (item.type === 'lote_pollitos') {
    const code = lotCode('POL', taken);
    bFarm.chickLots.unshift({ id: `chick-lot-${randomUUID()}`, code, birthId: '', sourceLotIds: [], incubationId: '', breed: lot.breed, initial: item.quantity, available: item.quantity, sold: 0, coopId: '', notes });
    return { code };
  }
  const eggs = lot as FertileEggLot, code = lotCode('FER', taken);
  bFarm.fertileLots.unshift({ id: `fertile-lot-${randomUUID()}`, code, sourceCollectionId: '', productType: eggs.productType, date: today, coopId: '', breed: eggs.breed, initial: item.quantity, available: item.quantity, sold: 0, incubated: 0, discarded: 0, fertility: eggs.fertility, storageNotes: '', notes });
  return { code };
}

/**
 * Transferencia de propiedad. Se ejecuta DENTRO de la transacción que confirma la recepción: o ocurre todo o nada.
 * Aves: el mismo id y código pasan al comprador. Lotes de pollitos/huevos: se descuenta del lote del vendedor y se crea uno nuevo.
 */
export async function executeTransfer(tx: Tx, op: OperationRecord, now: Date): Promise<TransferReceiptRecord> {
  const listing = await tx.listings.get(op.listingId);
  if (!listing || listing.birdId !== op.birdId) throw new ConflictError('La operación no corresponde al ave publicada.');
  if (op.status !== 'entrega_confirmada' || !op.paymentConfirmedAt || !op.sellerDeliveredAt) throw new ConflictError('Faltan confirmaciones de pago o entrega para transferir.');
  if (!(await activeLocks(tx, listing.id)).some(item => item.operationId === op.id)) throw new ConflictError('La publicación no está reservada para esta operación.');

  const sellerFarm = await tx.farms.get(op.sellerId), buyerFarm = await tx.farms.get(op.buyerId);
  if (!sellerFarm || !buyerFarm) throw new NotFoundError('No existe la granja de una de las partes.');
  const seller = (await tx.users.get(op.sellerId))!, buyer = (await tx.users.get(op.buyerId))!;
  const sellerData = structuredClone(sellerFarm.data) as FarmJson, buyerData = structuredClone(buyerFarm.data) as FarmJson;
  const sFarm = farmOf(sellerData), bFarm = farmOf(buyerData);
  ensureStock(sFarm); ensureStock(bFarm);
  const sellerAlias = aliasOf(seller), buyerAlias = aliasOf(buyer), today = day(now), at = now.toISOString();
  const type = itemTypeOf(listing), items = itemsOf(listing);

  let moved: Moved[] = [];
  let lotCodeOut = '';
  if (type === 'ave' || type === 'lote_aves') {
    for (const item of items) if (item.type === 'ave') moved.push(await moveBird(tx, op, listing, sFarm, bFarm, item.birdId, sellerAlias, today, at));
  } else {
    lotCodeOut = moveStock(op, sFarm, bFarm, items[0] as { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number }, sellerAlias, buyerAlias, today).code;
  }
  await tx.farms.update({ ...sellerFarm, data: sellerData, version: sellerFarm.version + 1, updatedAt: at });
  await tx.farms.update({ ...buyerFarm, data: buyerData, version: buyerFarm.version + 1, updatedAt: at });

  await releaseLocks(tx, listing.id, now);
  await tx.listings.update({ ...listing, status: 'vendida', closedReason: 'transferida', updatedAt: at, version: listing.version + 1 });

  const single = type === 'ave' ? moved[0] : undefined;
  const singleBird = single ? findBird(sellerData, single.birdId)! : undefined;
  const content: ReceiptContent = {
    code: receiptCode(now), birdId: single ? single.birdId : listing.birdId, birdCode: singleBird ? singleBird.code ?? '' : listing.snapshot.code ?? '',
    birdName: singleBird ? singleBird.name : listing.snapshot.title ?? listing.snapshot.name, ring: single?.ring ?? null,
    sellerAlias, buyerAlias, price: op.price, transferredAt: at, operationId: op.id,
  };
  const receipt: TransferReceiptRecord = { id: randomUUID(), code: content.code, birdId: content.birdId, operationId: op.id, listingId: listing.id, sellerId: op.sellerId, buyerId: op.buyerId, sellerAlias, buyerAlias, birdName: content.birdName, birdCode: content.birdCode, ring: content.ring, price: op.price, transferredAt: at, hash: receiptHash(content) };
  await tx.receipts.insert(receipt);
  await tx.audit.insert({ id: randomUUID(), actorId: op.buyerId, action: 'transfer.complete', targetType: single ? 'bird' : 'listing', targetId: single ? single.birdId : listing.id, detail: { operationId: op.id, from: op.sellerId, to: op.buyerId, receipt: receipt.code, itemType: type, birdIds: moved.map(item => item.birdId), lotCode: lotCodeOut || null, sharedHistoryEvents: moved.reduce((sum, item) => sum + item.sharedHistory, 0), ringKept: moved.some(item => item.ringKept) }, createdAt: at });
  await emit(tx, { type: 'market.transfer.completed', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, receiptCode: receipt.code }, dedupeKey: `transfer-completed:${op.id}`, now });
  return receipt;
}
```

Ajustes de imports: `FarmData`, `Bird`, `BirdEvent`, `RingAssignment`, `ChickLot`, `FertileEggLot` desde `../../../models/farm.ts`; `ListingRecord`, `OperationRecord`, `Tx`, `Store`, `TransferReceiptRecord` desde types; quitar `ListingRecord` de `closed` si ya no se usa. `ancestors(data: FarmData, …)` ya recibe `FarmData`.

- [ ] **Step 4: Ejecutar**

Run: `node --experimental-strip-types --test tests/market-lot-transfer.test.ts tests/market-transfer.test.ts` → PASS.
Run: `npm test` y `npm run typecheck` → PASS (la suite existente de transferencia de aves es la regresión: debe seguir verde sin cambios).

---

### Task 4: API y pantallas de tipos de publicación

**Files:**
- Modify: `src/app/api/market/listings/route.ts`, `src/app/api/market/route.ts`, `src/features/market/components/publish-dialog.tsx`, `listing-card.tsx`, `listing-detail.tsx`, `market-page.tsx`, `my-listings.tsx`, `src/features/app-shell/components/app-shell.tsx`, `src/features/market/style/market.css`, `.claude/launch.json` (crear para la verificación en navegador)

**Interfaces:**
- Consumes: `ListingInput` ampliado (Task 2); `PublicListing.snapshot.{itemType,quantity,title,lotBirds,fertility}`.
- Produces: `PublishDialog` props `{ bird?: Bird; initialType?: ItemType; data: FarmData; onClose; onDone }`; `GET /api/market?type=`; botón «Nueva publicación» en Mis publicaciones; estado `publishNew: boolean` en `AppShell`.

- [ ] **Step 1: Rutas.** En `listings/route.ts` (POST) leer los campos nuevos y pasarlos al servicio:

```ts
const listing = await createListing(deps(), ctxFor(user.id), {
  itemType: body.itemType as never, birdId: typeof body.birdId === 'string' ? body.birdId : undefined,
  birdIds: Array.isArray(body.birdIds) ? (body.birdIds as string[]) : undefined, lotId: typeof body.lotId === 'string' ? body.lotId : undefined,
  quantity: typeof body.quantity === 'number' ? body.quantity : undefined,
  kind, price: …, terms: …, consent: …, publish: …, auction: …,   // los campos existentes sin cambios
});
```

(quitar la exigencia `str(body.birdId, 'El ave', 120, true)`; `parseItems` valida). En `market/route.ts` añadir `type:q.get('type')??undefined` a `browseListings`.

- [ ] **Step 2: `publish-dialog.tsx`.** Convertir `bird` en opcional y añadir arriba del formulario un selector de tipo (cuatro botones tipo «radio» con una línea descriptiva cada uno: «Un ave», «Lote de aves», «Lote de pollitos», «Lote de huevos»). Estado nuevo: `itemType` (inicial `initialType ?? 'ave'`), `birdId` (inicial `bird?.id ?? ''`), `birdIds: string[]`, `lotId`, `quantity`. Fuentes por tipo:

  - `ave`: `<select>` con `data.birds` activas (`!['Vendido','Fallecido','Transferido'].includes(status)`).
  - `lote_aves`: lista con casillas y un campo de búsqueda; contador «N seleccionadas (mínimo 2, máximo 50)».
  - `lote_pollitos`: `<select>` de `data.chickLots.filter(l => l.available > 0)` con la etiqueta `${l.code} · ${l.available} disponibles · ${l.breed}` y `<input type="number" min="1" max={lot.available} step="1">`.
  - `lote_huevos`: igual con `data.fertileLots` (etiqueta con `productType` y `fertility`).

  Los switches de genealogía/reproducción/historial solo se muestran con `ave` y `lote_aves`; la foto del ave (`showPhoto`) solo con `ave` (las fotos subidas llegan en Task 6). Cuerpo enviado en `submit`:

```ts
const body = { itemType, ...(itemType === 'ave' ? { birdId } : itemType === 'lote_aves' ? { birdIds } : { lotId, quantity: Number(quantity) }), kind, price: …, terms, publish, auction, consent: { … } };
```

  El botón de enviar queda deshabilitado hasta que la fuente sea válida (ave elegida / ≥2 aves / lote + cantidad entera entre 1 y `available`).

- [ ] **Step 3: Tarjeta y detalle.** `listing-card.tsx`: insignia con el tipo («Ave», «Lote de aves», «Lote de pollitos», «Lote de huevos») usando un mapa `ITEM_LABELS` exportado desde `public-view.ts` junto a `KIND_LABELS`; el título es `snapshot.title ?? snapshot.name`; mostrar «× {quantity}» cuando `quantity > 1`. `listing-detail.tsx`: para `lote_aves` una tabla con `lotBirds` (nombre, código, sexo, raza, edad); para huevos «Fertilidad declarada: {fertility}»; para lotes ocultar genealogía/anillo. `ITEM_LABELS` en `public-view.ts`:

```ts
export const ITEM_LABELS: Record<ItemType, string> = { ave: 'Ave', lote_aves: 'Lote de aves', lote_pollitos: 'Lote de pollitos', lote_huevos: 'Lote de huevos' };
```

- [ ] **Step 4: Catálogo y mis publicaciones.** `market-page.tsx`: `<select>` «Tipo» (Todos + los cuatro) que añade `type=` a la consulta. `my-listings.tsx`: botón «Nueva publicación» que llama a una prop `onNew`. `app-shell.tsx`: estado `publishNew`; `PublishDialog` se renderiza con `{(publishBird || publishNew) && <PublishDialog bird={publishBird ?? undefined} initialType="ave" … />}` y se limpia ambos estados al cerrar.

- [ ] **Step 5: Verificar en navegador.** Crear `.claude/launch.json` con una configuración `pico-criollo` (`npm run dev`, puerto 3000, `STORAGE_DRIVER=file` por defecto); `preview_start`, registrar dos cuentas de prueba (datos ficticios), crear un lote de pollitos desde la granja demo y publicarlo; comprobar con `read_page`/captura que la tarjeta, el filtro y el detalle muestran el tipo y la cantidad; revisar consola sin errores.

- [ ] **Step 6: Ejecutar**

Run: `npm run lint`, `npm run typecheck`, `npm test` → PASS.

---

### Task 5: Varias fotos (servicio)

**Files:**
- Modify: `src/server/storage/types.ts`, `src/features/market/service/snapshot.ts` (`parsePhotos`), `listings.ts`, `public-view.ts`, `src/app/api/market/listings/route.ts`, `src/app/api/market/listings/[id]/route.ts`
- Test: `tests/market-photos.test.ts`

**Interfaces:**
- Produces: `ListingRecord.photoIds?: string[]` (fotos subidas por el vendedor, ids de `MediaStore`); `PublicSnapshot.photoIds?: string[]` (todas las del snapshot; `photoId` = la primera); `parsePhotos(raw: unknown): { mime: string; bytes: Uint8Array }[]` en `snapshot.ts`; `ListingInput.photos?: unknown`; `updateListing(…, patch)` acepta `photos?: unknown`; `PublicListing.snapshot.photoUrls: string[]` y `photoUrl` (primera).

- [ ] **Step 1: Pruebas (fallan)**

```ts
// tests/market-photos.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing, getListingForViewer, updateListing } from '../src/features/market/service/listings.ts';
import { makeEnv } from './helpers/env.ts';
import { ctx, deps, sellerWithBird, status } from './helpers/market.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG = (n: number) => `data:image/jpeg;base64,${Buffer.alloc(n, 1).toString('base64')}`;
const make = (env: Awaited<ReturnType<typeof makeEnv>>, userId: string, photos: unknown) => createListing(deps(env), ctx(env, userId), { birdId: 'luna', kind: 'fixed', price: 85000, publish: true, photos } as never);

test('guarda hasta 6 fotos en orden, la primera es la portada y photoId la apunta', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    const listing = await make(env, ana, [PNG, JPG(500), PNG]);
    assert.equal(listing.snapshot.photoIds?.length, 3);
    assert.equal(listing.snapshot.photoId, listing.snapshot.photoIds![0]);
    const view = await getListingForViewer(env.store, listing.id);
    assert.equal(view.listing.snapshot.photoUrls?.length, 3);
    assert.equal(view.listing.snapshot.photoUrl, view.listing.snapshot.photoUrls![0]);
    assert.equal((await env.media.get(listing.snapshot.photoIds![1]))?.mime, 'image/jpeg');
  } finally { await env.cleanup(); }
});

test('rechaza fotos inválidas: más de 6, tipo no permitido, base64 corrupto, >3 MB y total >12 MB', async () => {
  const env = await makeEnv();
  try {
    const ana = await sellerWithBird(env);
    await assert.rejects(make(env, ana, Array(7).fill(PNG)), status(400));
    await assert.rejects(make(env, ana, ['data:image/gif;base64,R0lGODlhAQABAAAAACw=']), status(400));
    await assert.rejects(make(env, ana, ['data:image/png;base64,@@@@']), status(400));
    await assert.rejects(make(env, ana, ['no-es-una-foto']), status(400));
    await assert.rejects(make(env, ana, [JPG(3 * 1024 * 1024 + 1)]), status(400));
    await assert.rejects(make(env, ana, Array(5).fill(JPG(2.9 * 1024 * 1024))), status(400));
    await assert.rejects(make(env, ana, 'una sola'), status(400));
  } finally { await env.cleanup(); }
});

test('sin fotos subidas se usa la foto del ave; editar fotos las reemplaza y vaciar vuelve a la del ave', async () => {
  const env = await makeEnv();
  try {
    const ana = await env.addUser('Ana');
    await env.saveFarm(ana, { birds: [{ id: 'luna', code: 'AVE-3', name: 'Luna', sex: 'Gallina', breed: 'Criolla', coopId: 'c', status: 'Activo', bornAt: '2025-06-01', origin: '', motherId: '', fatherId: '', photo: PNG, notes: '' }] });
    const listing = await make(env, ana, undefined);
    assert.equal(listing.snapshot.photoIds?.length, 1);
    const edited = await updateListing(deps(env), ctx(env, ana), listing.id, { photos: [PNG, PNG] });
    assert.equal(edited.snapshot.photoIds?.length, 2);
    assert.notEqual(edited.snapshot.photoIds![0], listing.snapshot.photoIds![0]);
    const cleared = await updateListing(deps(env), ctx(env, ana), listing.id, { photos: [] });
    assert.equal(cleared.snapshot.photoIds?.length, 1);
  } finally { await env.cleanup(); }
});
```

  Run: `node --experimental-strip-types --test tests/market-photos.test.ts` → FAIL.

- [ ] **Step 2: Tipos y parser.** En `types.ts`: `ListingRecord.photoIds?: string[]`, `PublicSnapshot.photoIds?: string[]`. En `snapshot.ts`:

```ts
export const MAX_PHOTOS = 6, MAX_PHOTOS_TOTAL_BYTES = 12 * 1024 * 1024;

/** Valida el lote de fotos recibido del cliente. Cualquier foto inválida rechaza toda la petición. */
export function parsePhotos(raw: unknown): { mime: string; bytes: Uint8Array }[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ValidationError('Las fotos no son válidas.');
  if (raw.length > MAX_PHOTOS) throw new ValidationError(`Puedes subir como máximo ${MAX_PHOTOS} fotos.`);
  const out: { mime: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const item of raw) {
    const photo = typeof item === 'string' ? parsePhoto(item) : undefined;
    if (!photo) throw new ValidationError('Una foto no es válida: usa JPG, PNG o WEBP de hasta 3 MB.');
    total += photo.bytes.length;
    if (total > MAX_PHOTOS_TOTAL_BYTES) throw new ValidationError('Las fotos superan el tamaño total permitido (12 MB).');
    out.push(photo);
  }
  return out;
}
```

  `parsePhoto` ya rechaza base64 inválido por la expresión regular y los >3 MB devolviendo `undefined`. Verificar que `'@@@@'` no pase la regex `[A-Za-z0-9+/=]+` (no pasa).

- [ ] **Step 3: `BuiltSnapshot` y `fillSnapshot`.** Cambiar `BuiltSnapshot.photo?` por `photo?` (se mantiene para el ave) y en `listings.ts`:

```ts
async function savePhotos(deps: Deps, ownerId: string, photos: { mime: string; bytes: Uint8Array }[]): Promise<string[]> {
  const ids: string[] = [];
  for (const photo of photos) { const id = randomUUID(); await deps.media.put({ id, mime: photo.mime, bytes: photo.bytes, ownerId }); ids.push(id); }
  return ids;
}

async function fillSnapshot(deps: Deps, tx: Tx, listing: ListingRecord, farmData: FarmJson, ctx: Ctx) {
  const seller = await userOf(tx, listing.sellerId);
  const built = buildListingSnapshot(farmData, itemTypeOf(listing), itemsOf(listing), listing.consent, aliasOf(seller), ctx.now);
  let photoIds = listing.photoIds ?? [];
  if (!photoIds.length && built.photo) photoIds = await savePhotos(deps, ctx.userId, [built.photo]);
  listing.snapshot = { ...built.snapshot, ...(photoIds.length ? { photoId: photoIds[0], photoIds } : {}) };
  listing.sourceHash = built.sourceHash;
  listing.needsReview = false;
}
```

  En `createListing`: `const photos = parsePhotos(input.photos);` antes de `deps.store.tx` (valida antes de abrir la transacción); dentro de la transacción, tras construir `listing` y antes de `fillSnapshot`: `if (photos.length) listing.photoIds = await savePhotos(deps, ctx.userId, photos);`. `ListingInput.photos?: unknown`.

  En `updateListing`: el `patch` admite `photos?: unknown`; `const photos = patch.photos === undefined ? undefined : parsePhotos(patch.photos);` antes de la transacción; dentro (después de las comprobaciones de estado y de `assertNoBids`): `if (photos) { listing.photoIds = await savePhotos(deps, ctx.userId, photos); await fillSnapshot(deps, tx, listing, farm.data, ctx); }` (cargar `farm` una sola vez, reutilizando el que ya se lee para `consent`).

  Efecto: `photos: []` deja `photoIds = []`, `fillSnapshot` vuelve a la foto del ave si aplica.

- [ ] **Step 4: Vista pública.** En `publicView` sustituir la línea de `photoUrl` por:

```ts
      ...(s.photoIds?.length ? { photoUrls: s.photoIds.map(id => `/api/media/${id}`), photoUrl: `/api/media/${s.photoIds[0]}` } : s.photoId ? { photoUrls: [`/api/media/${s.photoId}`], photoUrl: `/api/media/${s.photoId}` } : {}),
```

  y declarar `photoUrls?: string[]` en el tipo de `PublicListing.snapshot` (`Omit<PublicSnapshot, 'photoId' | 'photoIds'> & { photoUrl?: string; photoUrls?: string[] }`).

- [ ] **Step 5: Rutas.** `listings/route.ts` (POST): `photos: body.photos`. `listings/[id]/route.ts` (PATCH): incluir `photos: body.photos` en el `patch` que se pasa a `updateListing`.

- [ ] **Step 6: Ejecutar**

Run: `node --experimental-strip-types --test tests/market-photos.test.ts` → PASS; `npm test`, `npm run typecheck` → PASS.

---

### Task 6: Varias fotos (interfaz)

**Files:**
- Create: `src/features/market/components/photo-picker.tsx`, `photo-gallery.tsx`
- Modify: `publish-dialog.tsx`, `listing-card.tsx`, `listing-detail.tsx`, `src/features/market/style/market.css`

**Interfaces:**
- Produces: `PhotoPicker({ value, onChange, max = 6 }: { value: string[]; onChange: (photos: string[]) => void; max?: number })` (data URLs ya reducidas); `PhotoGallery({ urls, alt }: { urls: string[]; alt: string })`; función pura `fitSize(width: number, height: number, max: number): { width: number; height: number }`.

- [ ] **Step 1: `photo-picker.tsx`.** Cliente (`'use client'`). `<input type="file" accept="image/png,image/jpeg,image/webp" multiple>`; por cada archivo: leer con `createImageBitmap`, escalar con `fitSize(w, h, 1600)` en un `<canvas>`, exportar `canvas.toDataURL('image/jpeg', 0.8)`; ignorar archivos que no sean imagen y mostrar «Se omitieron N archivos que no son imagen»; no pasar de `max` (mensaje «Máximo 6 fotos»); miniaturas con botón «Quitar» y etiqueta «Portada» en la primera. Reducción pura exportada y probable con `node --test`:

```ts
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
```

  Prueba (añadir a `tests/market-photos.test.ts`, importando con ruta relativa y extensión `.ts` desde un archivo sin JSX: por eso `fitSize` vive en `src/features/market/service/photo-size.ts` y el componente la importa): `fitSize(4000, 2000, 1600)` → `{ width: 1600, height: 800 }`; `fitSize(800, 600, 1600)` → sin cambio; `fitSize(1, 5000, 1600)` → `{ width: 1, height: 1600 }`.

- [ ] **Step 2: `photo-gallery.tsx`.** Imagen grande (`<img>` con `alt`) + fila de miniaturas; clic en una miniatura la muestra; con una sola foto no hay miniaturas; sin fotos muestra el marcador actual de «Sin foto». Accesible: botones con `aria-label="Ver foto N de M"` y `aria-current` en la activa.

- [ ] **Step 3: Integración.** `publish-dialog.tsx`: sección «Fotos» con `PhotoPicker`; estado `photos: string[]` enviado como `photos` en el cuerpo; para lotes, aviso «Recomendado: agrega fotos del lote»; para `ave` con foto en la ficha y `photos` vacío se mantiene el interruptor «Mostrar la foto de la ficha». `listing-card.tsx`: portada = `snapshot.photoUrl`; insignia «N fotos» si `photoUrls.length > 1`. `listing-detail.tsx`: reemplazar la imagen única por `PhotoGallery`. Estilos en `market.css` (galería 4:3, miniaturas 64 px con borde en la activa, grid de miniaturas del picker; respetar `prefers-reduced-motion`).

- [ ] **Step 4: Verificar en navegador.** Publicar con 3 fotos reales de prueba (generadas en un canvas desde `javascript_tool`), comprobar galería, portada en la tarjeta, límite de 6 y quitar; captura de pantalla en ancho móvil (`resize_window` preset mobile) y desktop.

- [ ] **Step 5: Ejecutar** `npm test`, `npm run lint`, `npm run typecheck` → PASS.

---

### Task 7: Factura POS (servicio y API)

**Files:**
- Create: `src/features/market/service/invoices.ts`, `src/app/api/market/invoices/route.ts`, `src/app/api/invoices/[number]/route.ts`
- Modify: `src/server/storage/types.ts`, `specs.ts`, `database/migrations/002_market.sql` (generado), `transfer.ts`, `operations.ts`, `events.ts`, `tests/helpers/*` (si el `Tx` de prueba enumera colecciones; comprobar `store-contract.ts`)
- Test: `tests/market-invoices.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```ts
export interface InvoiceLine { description: string; detail: string[]; itemType: ItemType; unit: 'ave' | 'lote'; quantity: 1; unitPrice: number; total: number; }
export interface InvoiceRecord {
  id: string; number: string; operationId: string; listingId: string; receiptCode: string;
  sellerId: string; buyerId: string; sellerAlias: string; buyerAlias: string;
  lines: InvoiceLine[]; subtotal: number; total: number; currency: 'COP';
  paymentMethod?: string; paymentDeclaredAt?: string; paymentConfirmedAt: string; deliveredAt: string; receivedAt: string; issuedAt: string; hash: string;
}
```
  y `Tx.invoices: Collection<InvoiceRecord>`; `specs.ts`: `{ name: 'invoices', table: 'pc_invoices', unique: [{ fields: ['number'] }, { fields: ['operationId'] }], index: ['sellerId', 'buyerId'] }`.
- Produces (`invoices.ts`):
  - `issueInvoice(tx: Tx, op: OperationRecord, listing: ListingRecord, receipt: TransferReceiptRecord, now: Date): Promise<InvoiceRecord>`
  - `invoiceHash(invoice: Omit<InvoiceRecord, 'id' | 'hash'>): string`, `verifyInvoice(invoice: InvoiceRecord): boolean`
  - `listInvoices(store: Store, userId: string, role?: 'comprador' | 'vendedor'): Promise<InvoiceSummary[]>` con `InvoiceSummary { number; issuedAt; title; total; role: 'comprador' | 'vendedor'; counterpart: string; operationId }`
  - `getInvoice(store: Store, userId: string, number: string): Promise<InvoiceView>` con `InvoiceView = InvoiceRecord & { role: 'comprador' | 'vendedor'; integrity: boolean }` sin ids de usuario (`sellerId`/`buyerId` se omiten en la respuesta)
- Produces: `OperationView.invoiceNumber?: string`; evento `market.invoice.issued`.

- [ ] **Step 1: Pruebas (fallan)**

```ts
// tests/market-invoices.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing } from '../src/features/market/service/listings.ts';
import { getInvoice, listInvoices, verifyInvoice } from '../src/features/market/service/invoices.ts';
import { confirmPayment, confirmReceipt, declarePayment, listOperations, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, notes, status } from './helpers/market.ts';

async function sale(env: TestEnv, seller: string, buyer: string, input: Record<string, unknown>, price = 150000) {
  const listing = await createListing(deps(env), ctx(env, seller), { kind: 'fixed', price, publish: true, ...input } as never);
  const op = await requestPurchase(env.store, ctx(env, buyer), listing.id);
  await respondPurchase(env.store, ctx(env, seller), op.id, 'accept');
  await declarePayment(env.store, ctx(env, buyer), op.id, 'Nequi');
  await confirmPayment(env.store, ctx(env, seller), op.id);
  await markDelivered(env.store, ctx(env, seller), op.id);
  return { listing, op };
}
async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto'), carla = await env.addUser('Carla');
  await env.saveFarm(ana, {
    birds: [bird({ id: 'b1', name: 'Uno', code: 'AVE-1' }), bird({ id: 'b2', name: 'Dos', code: 'AVE-2' })],
    chickLots: [{ id: 'ch1', code: 'POL-0001-AAAA1111', birthId: '', sourceLotIds: [], incubationId: '', breed: 'Brahma', initial: 20, available: 20, sold: 0, coopId: 'c', notes: '' }],
  });
  return { ana, beto, carla };
}

test('la factura se emite solo al completar la venta, una por operación, y ambas partes la ven', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'ave', birdId: 'b1' });
    assert.equal((await listInvoices(env.store, beto)).length, 0); // aún no recibida
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const bought = await listInvoices(env.store, beto), sold = await listInvoices(env.store, ana);
    assert.equal(bought.length, 1); assert.equal(sold.length, 1);
    assert.match(bought[0].number, /^FAC-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(bought[0].role, 'comprador'); assert.equal(sold[0].role, 'vendedor');
    assert.equal(bought[0].total, 150000); assert.equal(bought[0].counterpart, 'Ana');
    assert.equal((await listInvoices(env.store, ana, 'comprador')).length, 0);
    assert.equal((await listOperations(env.store, beto)).find(item => item.id === op.id)?.invoiceNumber, bought[0].number);
    const view = await getInvoice(env.store, beto, bought[0].number);
    assert.equal(view.integrity, true); assert.equal(view.paymentMethod, 'Nequi');
    assert.equal(view.lines.length, 1); assert.equal(view.lines[0].total, 150000); assert.equal(view.lines[0].unit, 'ave');
    assert.ok(!('sellerId' in view)); assert.ok(!JSON.stringify(view).includes('@correo.test'));
    assert.equal((await notes(env, ana, 'market.invoice.issued')).length, 1);
    assert.equal((await notes(env, beto, 'market.invoice.issued')).length, 1);
  } finally { await env.cleanup(); }
});

test('contenido de la factura por tipo de publicación', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const lote = await sale(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] }, 200000);
    await confirmReceipt(env.store, ctx(env, beto), lote.op.id);
    const pollitos = await sale(env, ana, beto, { itemType: 'lote_pollitos', lotId: 'ch1', quantity: 8 }, 96000);
    await confirmReceipt(env.store, ctx(env, beto), pollitos.op.id);
    const list = await listInvoices(env.store, ana);
    const a = await getInvoice(env.store, ana, list.find(i => i.total === 200000)!.number);
    assert.equal(a.lines[0].unit, 'lote'); assert.equal(a.lines[0].itemType, 'lote_aves'); assert.deepEqual(a.lines[0].detail, ['Uno · AVE-1', 'Dos · AVE-2']);
    const p = await getInvoice(env.store, ana, list.find(i => i.total === 96000)!.number);
    assert.equal(p.lines[0].description, 'Lote de 8 pollitos Brahma'); assert.deepEqual(p.lines[0].detail, ['8 pollitos Brahma']);
  } finally { await env.cleanup(); }
});

test('un tercero no ve facturas ajenas; número inexistente da 404; la huella detecta alteraciones', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto, carla } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'ave', birdId: 'b1' });
    await confirmReceipt(env.store, ctx(env, beto), op.id);
    const number = (await listInvoices(env.store, ana))[0].number;
    await assert.rejects(getInvoice(env.store, carla, number), status(403));
    assert.equal((await listInvoices(env.store, carla)).length, 0);
    await assert.rejects(getInvoice(env.store, ana, 'FAC-00000000-XXXXXX'), status(404));
    const record = await env.store.tx(async tx => (await tx.invoices.list({ number }))[0]);
    assert.equal(verifyInvoice(record), true);
    assert.equal(verifyInvoice({ ...record, total: record.total + 1 }), false);
  } finally { await env.cleanup(); }
});

test('si la transferencia falla no queda factura', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const { op } = await sale(env, ana, beto, { itemType: 'lote_aves', birdIds: ['b1', 'b2'] });
    await env.store.tx(async tx => { const own = (await tx.ownership.get('b2'))!; await tx.ownership.update({ ...own, ownerId: 'otro' }); });
    await assert.rejects(confirmReceipt(env.store, ctx(env, beto), op.id), status(409));
    await env.store.tx(async tx => assert.equal((await tx.invoices.list()).length, 0));
  } finally { await env.cleanup(); }
});
```

  Run: `node --experimental-strip-types --test tests/market-invoices.test.ts` → FAIL.

- [ ] **Step 2: Tipos, colección y migración.** Añadir `InvoiceLine`, `InvoiceRecord` y `invoices` en `Tx`/`specs.ts` como arriba. Si `tests/helpers/store-contract.ts` o los drivers listan colecciones a mano, añadir `invoices` (buscar con `grep -rn "pushSubscriptions" src tests`). Ejecutar `npm run db:migration`.

- [ ] **Step 3: `invoices.ts`**

```ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError } from '../../../server/errors.ts';
import type { InvoiceLine, InvoiceRecord, ListingRecord, OperationRecord, Store, Tx, TransferReceiptRecord } from '../../../server/storage/types.ts';
import { emit } from '../../notifications/service/events.ts';
import { itemTypeOf, itemsOf } from './items.ts';
import { aliasOf, findBird } from './snapshot.ts';
import type { FarmJson } from './snapshot.ts';

const day = (now: Date) => now.toISOString().slice(0, 10).replace(/-/g, '');

export function invoiceNumber(now: Date): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `FAC-${day(now)}-${[...randomBytes(6)].map(byte => letters[byte % letters.length]).join('')}`;
}

/** JSON con claves ordenadas en todos los niveles: la huella no depende del orden de inserción. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const invoiceHash = (invoice: Omit<InvoiceRecord, 'id' | 'hash'>): string => createHash('sha256').update(canonical(invoice)).digest('hex');
export function verifyInvoice(invoice: InvoiceRecord): boolean {
  const { id: _id, hash, ...content } = invoice;
  return invoiceHash(content) === hash;
}

function lineOf(listing: ListingRecord, sellerData: FarmJson, price: number): InvoiceLine {
  const type = itemTypeOf(listing), items = itemsOf(listing);
  const description = listing.snapshot.title ?? listing.snapshot.name;
  let detail: string[] = [];
  if (type === 'ave' || type === 'lote_aves') detail = items.flatMap(item => { if (item.type !== 'ave') return []; const bird = findBird(sellerData, item.birdId); return bird ? [`${bird.name} · ${bird.code ?? 'sin código'}`] : []; });
  else detail = [`${listing.snapshot.quantity ?? 0} ${type === 'lote_pollitos' ? 'pollitos' : 'huevos'} ${listing.snapshot.breed}`.trim()];
  return { description, detail, itemType: type, unit: type === 'ave' ? 'ave' : 'lote', quantity: 1, unitPrice: price, total: price };
}

/** Se llama dentro de la transacción de la transferencia: la factura existe si y solo si la venta se completó. */
export async function issueInvoice(tx: Tx, op: OperationRecord, listing: ListingRecord, receipt: TransferReceiptRecord, now: Date, sellerData: FarmJson): Promise<InvoiceRecord> {
  const issuedAt = now.toISOString();
  const content: Omit<InvoiceRecord, 'id' | 'hash'> = {
    number: invoiceNumber(now), operationId: op.id, listingId: listing.id, receiptCode: receipt.code,
    sellerId: op.sellerId, buyerId: op.buyerId, sellerAlias: receipt.sellerAlias, buyerAlias: receipt.buyerAlias,
    lines: [lineOf(listing, sellerData, op.price)], subtotal: op.price, total: op.price, currency: 'COP',
    ...(op.paymentMethod ? { paymentMethod: op.paymentMethod } : {}), ...(op.paymentDeclaredAt ? { paymentDeclaredAt: op.paymentDeclaredAt } : {}),
    paymentConfirmedAt: op.paymentConfirmedAt!, deliveredAt: op.sellerDeliveredAt!, receivedAt: op.buyerReceivedAt ?? issuedAt, issuedAt,
  };
  const invoice: InvoiceRecord = { id: randomUUID(), ...content, hash: invoiceHash(content) };
  await tx.invoices.insert(invoice);
  await emit(tx, { type: 'market.invoice.issued', aggregateType: 'operation', aggregateId: op.id, payload: { operationId: op.id, invoiceId: invoice.id }, dedupeKey: `invoice-issued:${op.id}`, now });
  return invoice;
}

export interface InvoiceSummary { number: string; issuedAt: string; title: string; total: number; role: 'comprador' | 'vendedor'; counterpart: string; operationId: string; }
export type InvoiceView = Omit<InvoiceRecord, 'id' | 'sellerId' | 'buyerId'> & { role: 'comprador' | 'vendedor'; integrity: boolean };

export async function listInvoices(store: Store, userId: string, role?: 'comprador' | 'vendedor'): Promise<InvoiceSummary[]> {
  return store.tx(async tx => {
    const rows = [...(role !== 'vendedor' ? await tx.invoices.list({ buyerId: userId }) : []), ...(role !== 'comprador' ? await tx.invoices.list({ sellerId: userId }) : [])];
    return rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map(row => ({
      number: row.number, issuedAt: row.issuedAt, title: row.lines[0]?.description ?? 'Venta', total: row.total, operationId: row.operationId,
      role: row.buyerId === userId ? 'comprador' as const : 'vendedor' as const, counterpart: row.buyerId === userId ? row.sellerAlias : row.buyerAlias,
    }));
  });
}

export async function getInvoice(store: Store, userId: string, number: string): Promise<InvoiceView> {
  return store.tx(async tx => {
    const invoice = (await tx.invoices.list({ number }))[0];
    if (!invoice) throw new NotFoundError('Factura no encontrada.');
    if (invoice.buyerId !== userId && invoice.sellerId !== userId) throw new ForbiddenError('Esta factura no es tuya.');
    const { id: _id, sellerId, buyerId, ...rest } = invoice;
    return { ...rest, role: buyerId === userId ? 'comprador' : 'vendedor', integrity: verifyInvoice(invoice) };
  });
}
```

  (Si `aliasOf` queda sin uso en este archivo, quitarlo del import.)

- [ ] **Step 4: Emitir desde la transferencia y exponer en operaciones.** En `transfer.ts`, importar `issueInvoice` y, justo después de `await tx.receipts.insert(receipt);`, añadir `await issueInvoice(tx, op, listing, receipt, now, sellerData);`. Ojo: `op.buyerReceivedAt` ya se asigna en `confirmReceipt` antes de `executeTransfer`. En `operations.ts` `OperationView` añadir `invoiceNumber?: string` y en `listOperations` leerlo: `const invoice = (await tx.invoices.list({ operationId: op.id }))[0];` y `...(invoice ? { invoiceNumber: invoice.number } : {})`.

- [ ] **Step 5: Evento.** En `events.ts` añadir (junto a `market.transfer.completed`):

```ts
  'market.invoice.issued': {
    category: 'comercial', priority: 'normal', critical: false,
    recipients: async (tx, event) => { const invoice = await tx.invoices.get(String(event.payload.invoiceId)); return invoice ? [invoice.sellerId, invoice.buyerId] : []; },
    render: async (tx, event) => {
      const invoice = await tx.invoices.get(String(event.payload.invoiceId));
      return { title: `Factura ${invoice?.number ?? ''}`.trim(), body: `Se emitió la factura por ${cop(invoice?.total ?? 0)} de «${invoice?.lines[0]?.description ?? 'tu venta'}». Puedes verla e imprimirla desde Mis facturas.`, link: { view: 'facturas', id: invoice?.number } };
    },
  },
```

- [ ] **Step 6: Rutas.**

```ts
// src/app/api/market/invoices/route.ts
import { listInvoices } from '@/features/market/service/invoices';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>{
  const role=new URL(ctx.request.url).searchParams.get('role');
  return listInvoices(deps().store,requireUser(ctx).id,role==='comprador'||role==='vendedor'?role:undefined);
});
```

```ts
// src/app/api/invoices/[number]/route.ts
import { getInvoice } from '@/features/market/service/invoices';
import { requireUser, route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
export const GET=route({auth:true},async ctx=>getInvoice(deps().store,requireUser(ctx).id,ctx.params.number));
```

- [ ] **Step 7: Ejecutar**

Run: `node --experimental-strip-types --test tests/market-invoices.test.ts` → PASS; `npm test` (incluye la prueba de migración actualizada), `npm run typecheck` → PASS. Si alguna prueba de notificaciones cuenta eventos de una venta completada, ajustarla al evento nuevo.

---

### Task 8: Factura POS (interfaz)

**Files:**
- Create: `src/features/market/components/invoices-page.tsx`, `invoice-view.tsx`, `src/app/facturas/[number]/page.tsx`
- Modify: `src/features/app-shell/components/app-shell.tsx`, `operation-card.tsx`, `src/features/notifications/components/notification-center.tsx` (solo si la navegación por `link.view` está en una lista cerrada), `src/features/market/style/market.css`

**Interfaces:**
- Consumes: `GET /api/market/invoices?role=`, `GET /api/invoices/[number]`, `OperationView.invoiceNumber`.
- Produces: vista `facturas` en el `AppShell`; página `/facturas/[number]`.

- [ ] **Step 1: `invoices-page.tsx`.** Lista de «Mis facturas»: pestañas «Todas / Compras / Ventas» (consulta con `?role=`), buscador por número o título, tabla (Número, Fecha en la zona del usuario con `formatInZone`, Concepto, Contraparte, Total con `money`) con enlace «Ver» a `/facturas/<número>` (misma pestaña); estado vacío «Aún no tienes facturas. Se generan cuando se completa una venta o compra del mercado.»; error con `role="alert"`.

- [ ] **Step 2: `invoice-view.tsx` + página.** Igual que `TransferReceiptView`: botones «Volver a Pico Criollo» y «Imprimir o guardar PDF»; hoja `article.pos-ticket` de ancho 80 mm con: encabezado «PICO CRIOLLO · Mercado Avícola», «FACTURA DE VENTA POS» y número; fecha de emisión; Vendedor / Comprador (alias); línea de producto (descripción, detalle en líneas pequeñas, `1 ave|lote × precio`), Subtotal, «Sin IVA discriminado», TOTAL; Medio de pago, «Pago confirmado por el vendedor el …» y «Entrega confirmada el …»; comprobante relacionado `TRF-…` con enlace a `/transferencias/<código>`; huella SHA-256 abreviada y «Integridad: coincide / ADVERTENCIA»; pie obligatorio (ver Global Constraints). Error 403/404 con el texto «Inicia sesión con la cuenta del vendedor o del comprador.» `src/app/facturas/[number]/page.tsx` replica `transferencias/[code]/page.tsx` con `metadata = { title: 'Factura | Pico Criollo', robots: { index: false } }`.

- [ ] **Step 3: Estilos.** En `market.css`: `.pos-ticket { width: 80mm; font-family: ui-monospace, monospace; font-size: 12px; … }`, líneas punteadas `border-top: 1px dashed`, `@page { size: 80mm auto; margin: 4mm; }` y `@media print { body * { visibility: hidden } .pos-ticket, .pos-ticket * { visibility: visible } .pos-ticket { position: absolute; left: 0; top: 0 } }`; en pantallas estrechas el ticket se centra con `max-width: 100%`.

- [ ] **Step 4: AppShell y tarjeta de compra.** `app-shell.tsx`: añadir `'facturas'` a `MARKET_VIEWS`, un ítem de menú «Mis facturas» (ícono `receipt`, sección del mercado, junto a «Mis compras») y el título en `TITLES`; renderizar `<InvoicesPage />` cuando `view === 'facturas'`. `operation-card.tsx`: junto al enlace del comprobante, `{op.invoiceNumber && <a className="btn-secondary" href={`/facturas/${op.invoiceNumber}`} target="_blank" rel="noreferrer">Ver factura {op.invoiceNumber}</a>}`. Verificar cómo `notification-center.tsx` convierte `link.view` en navegación y asegurar que `facturas` funciona (el enlace lleva `id` = número; abrir la lista basta).

- [ ] **Step 5: Verificar en navegador.** Completar una venta de punta a punta con dos cuentas (publicar → solicitar → aceptar → pagar → confirmar → entregar → recibir); como comprador y como vendedor abrir «Mis facturas» y el ticket; una tercera cuenta recibe el mensaje de error; vista previa de impresión (`window.print` no se ejecuta: comprobar con `emulateMedia` print si el navegador lo permite, o revisar el CSS con `javascript_tool`); capturas.

- [ ] **Step 6: Ejecutar** `npm run lint`, `npm run typecheck`, `npm test` → PASS.

---

### Task 9: Perfil del vendedor y reputación (servicio y API)

**Files:**
- Create: `src/features/market/service/seller-profile.ts`, `src/app/api/market/sellers/[id]/route.ts`
- Modify: `trust.ts`, `listings.ts`, `public-view.ts`, `tests/market-trust.test.ts`
- Test: `tests/market-seller-profile.test.ts`

**Interfaces:**
- Produces (`trust.ts`):
  - `Reputation` gana `distribution: [number, number, number, number, number]`; `reputationFrom` la calcula con las valoraciones que cuentan (tope por pareja).
  - `sellerReputationIn(tx: Tx, sellerId: string): Promise<Reputation>` — valoraciones recibidas **como vendedor** y `completed` = ventas completadas.
  - `reviewVisible(op, ratingsOfOp, rating, now): boolean`
- Produces (`listings.ts`): `publicListingsIn(tx: Tx, rows: ListingRecord[], now: Date): Promise<PublicListing[]>` (la proyección que hoy hace `browseListings`).
- Produces (`seller-profile.ts`): `getSellerProfile(store: Store, sellerId: string, now: Date, options?: { reviewsOffset?: number }): Promise<SellerProfile>` con la forma del spec §5.1 más `reviewsTotal: number`.
- Produces: `PublicListing.sellerId: string`.
- Route: `GET /api/market/sellers/[id]?reviewsOffset=` (`auth: false`).

- [ ] **Step 1: Pruebas (fallan)**

```ts
// tests/market-seller-profile.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing } from '../src/features/market/service/listings.ts';
import { confirmPayment, confirmReceipt, declarePayment, markDelivered, requestPurchase, respondPurchase } from '../src/features/market/service/operations.ts';
import { getSellerProfile } from '../src/features/market/service/seller-profile.ts';
import { RATING_WINDOW_MS, rateOperation } from '../src/features/market/service/trust.ts';
import { bird, makeEnv } from './helpers/env.ts';
import type { TestEnv } from './helpers/env.ts';
import { ctx, deps, status } from './helpers/market.ts';

async function sold(env: TestEnv, seller: string, buyer: string, birdId: string, price: number) {
  const listing = await createListing(deps(env), ctx(env, seller), { birdId, kind: 'fixed', price, publish: true });
  const op = await requestPurchase(env.store, ctx(env, buyer), listing.id);
  await respondPurchase(env.store, ctx(env, seller), op.id, 'accept');
  await declarePayment(env.store, ctx(env, buyer), op.id, 'Efectivo'); await confirmPayment(env.store, ctx(env, seller), op.id);
  await markDelivered(env.store, ctx(env, seller), op.id); await confirmReceipt(env.store, ctx(env, buyer), op.id);
  return op;
}
async function world(env: TestEnv) {
  const ana = await env.addUser('Ana'), beto = await env.addUser('Beto');
  await env.saveFarm(ana, { birds: ['a', 'b', 'c'].map(id => bird({ id, name: id.toUpperCase(), code: `AVE-${id}`, notes: 'NOTA-PRIVADA-NO-PUBLICAR' })) });
  return { ana, beto };
}

test('vendedor sin ventas: perfil en ceros, sin dividir por cero', async () => {
  const env = await makeEnv();
  try {
    const { ana } = await world(env);
    const profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.alias, 'Ana');
    assert.deepEqual(profile.reputation, { count: 0, average: 0, distribution: [0, 0, 0, 0, 0], completedSales: 0 });
    assert.deepEqual(profile.active, []); assert.deepEqual(profile.sold, []); assert.deepEqual(profile.reviews, []);
    await assert.rejects(getSellerProfile(env.store, 'no-existe', env.now), status(404));
  } finally { await env.cleanup(); }
});

test('el perfil muestra activas, vendidas sin precio ni comprador, y no filtra datos privados', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    await sold(env, ana, beto, 'a', 91111);
    await createListing(deps(env), ctx(env, ana), { birdId: 'b', kind: 'fixed', price: 70000, publish: true });
    const profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reputation.completedSales, 1);
    assert.equal(profile.active.length, 1); assert.equal(profile.active[0].sellerId, ana);
    assert.equal(profile.sold.length, 1); assert.equal(profile.sold[0].title, 'A');
    const json = JSON.stringify(profile);
    for (const secret of ['91111', 'Beto', '@correo.test', 'NOTA-PRIVADA-NO-PUBLICAR', 'secreto-hash']) assert.ok(!json.includes(secret), `no debe filtrar ${secret}`);
  } finally { await env.cleanup(); }
});

test('una opinión es pública cuando ambas partes valoraron o venció el plazo; la reputación es solo como vendedor', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    const op = await sold(env, ana, beto, 'a', 80000);
    await rateOperation(env.store, ctx(env, beto), op.id, { stars: 5, comment: 'Excelente trato' });
    let profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reviews.length, 0); // la otra parte aún no valoró
    assert.equal(profile.reputation.count, 1); assert.equal(profile.reputation.average, 5); assert.deepEqual(profile.reputation.distribution, [0, 0, 0, 0, 1]);
    await rateOperation(env.store, ctx(env, ana), op.id, { stars: 4, comment: 'Buen comprador' });
    profile = await getSellerProfile(env.store, ana, env.now);
    assert.equal(profile.reviews.length, 1);
    assert.deepEqual({ stars: profile.reviews[0].stars, comment: profile.reviews[0].comment, raterAlias: profile.reviews[0].raterAlias }, { stars: 5, comment: 'Excelente trato', raterAlias: 'Beto' });
    const asBuyer = await getSellerProfile(env.store, beto, env.now);
    assert.equal(asBuyer.reputation.count, 0); // la valoración de Ana a Beto no cuenta como vendedor
    const later = new Date(env.now.getTime() + RATING_WINDOW_MS + 1000);
    const op2 = await sold(env, ana, beto, 'b', 60000);
    await rateOperation(env.store, ctx(env, beto, env.now), op2.id, { stars: 3, comment: 'Regular' });
    assert.equal((await getSellerProfile(env.store, ana, env.now)).reviews.length, 1);
    assert.equal((await getSellerProfile(env.store, ana, later)).reviews.length, 2);
  } finally { await env.cleanup(); }
});

test('vendedor suspendido sigue visible pero sin publicaciones activas; las reseñas se paginan de 20 en 20', async () => {
  const env = await makeEnv();
  try {
    const { ana, beto } = await world(env);
    await createListing(deps(env), ctx(env, ana), { birdId: 'c', kind: 'fixed', price: 50000, publish: true });
    await env.store.tx(async tx => { const user = (await tx.users.get(ana))!; await tx.users.update({ ...user, suspendedAt: env.now.toISOString(), suspendedReason: 'prueba' }); });
    assert.deepEqual((await getSellerProfile(env.store, ana, env.now)).active, []);
    const page = await getSellerProfile(env.store, ana, env.now, { reviewsOffset: 20 });
    assert.equal(page.reviewsTotal, 0); assert.deepEqual(page.reviews, []);
    void beto;
  } finally { await env.cleanup(); }
});
```

  (`ctx` del helper admite un tercer parámetro `now`; ya existe.) Run: `node --experimental-strip-types --test tests/market-seller-profile.test.ts` → FAIL.

- [ ] **Step 2: `trust.ts`.**

```ts
export interface Reputation { count: number; average: number; completed: number; distribution: [number, number, number, number, number]; }

export function reputationFrom(ratings: Pick<RatingRecord, 'raterId' | 'rateeId' | 'stars' | 'createdAt'>[], completed: number): Reputation {
  const perPair = new Map<string, number>();
  const distribution: Reputation['distribution'] = [0, 0, 0, 0, 0];
  let sum = 0, count = 0;
  for (const rating of [...ratings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${rating.raterId}>${rating.rateeId}`, used = perPair.get(key) ?? 0;
    if (used >= PAIR_CAP) continue;
    perPair.set(key, used + 1);
    sum += rating.stars; count++; distribution[rating.stars - 1] += 1;
  }
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, completed, distribution };
}

/** Reputación como vendedor: valoraciones que recibió de compradores y ventas completadas. */
export async function sellerReputationIn(tx: Tx, sellerId: string): Promise<Reputation> {
  const ops = (await tx.operations.list({ sellerId })).filter(op => op.status === 'completada');
  const byOp = new Set(ops.map(op => op.id));
  const ratings = (await tx.ratings.list({ rateeId: sellerId })).filter(row => byOp.has(row.operationId));
  return reputationFrom(ratings, ops.length);
}

/** Una opinión se publica cuando ambas partes valoraron o venció el plazo (evita represalias). */
export function reviewVisible(op: { history: { at: string; status: string }[] }, ratingsOfOp: Pick<RatingRecord, 'raterId'>[], now: Date): boolean {
  if (new Set(ratingsOfOp.map(row => row.raterId)).size >= 2) return true;
  const closed = completedAt(op);
  return Boolean(closed) && now.getTime() - new Date(closed!).getTime() > RATING_WINDOW_MS;
}
```

  `reputationIn` (mixta) se conserva sin uso nuevo (la usa `publicProfile`; cambiar `publicProfile` a `sellerReputationIn`). Ajustar `tests/market-trust.test.ts` donde compare el objeto de reputación completo para incluir `distribution`, y donde afirme conteos mezclando compras y ventas pasarlos a «como vendedor».

- [ ] **Step 3: `listings.ts`.** Extraer de `browseListings` el cuerpo que arma `PublicListing[]` a:

```ts
export async function publicListingsIn(tx: Tx, rows: ListingRecord[], now: Date): Promise<PublicListing[]> {
  const items: PublicListing[] = [];
  const aliases = new Map<string, string>(), stats = new Map<string, Awaited<ReturnType<typeof sellerReputationIn>>>();
  for (const row of rows) {
    if (!aliases.has(row.sellerId)) { const owner = await tx.users.get(row.sellerId); aliases.set(row.sellerId, owner ? aliasOf(owner) : 'Criador'); stats.set(row.sellerId, await sellerReputationIn(tx, row.sellerId)); }
    items.push(publicView(row, aliases.get(row.sellerId)!, auctionState(row, row.kind === 'auction' ? await tx.bids.list({ listingId: row.id }) : [], now), stats.get(row.sellerId)));
  }
  return items;
}
```

  y que `browseListings` la use (`items = await publicListingsIn(tx, rows.slice(offset, offset + limit), now)`). Sustituir `reputationIn` por `sellerReputationIn` en `getListingForViewer`. En `public-view.ts`: `PublicListing.sellerId: string` y en `publicView` `sellerId: listing.sellerId`; `sellerReputation` pasa a `{ count, average, completed }` (mismo tipo, ahora como vendedor).

- [ ] **Step 4: `seller-profile.ts`**

```ts
import { NotFoundError } from '../../../server/errors.ts';
import type { ItemType, Store } from '../../../server/storage/types.ts';
import { itemTypeOf } from './items.ts';
import { publicListingsIn } from './listings.ts';
import type { PublicListing } from './public-view.ts';
import { aliasOf } from './snapshot.ts';
import { reviewVisible, sellerReputationIn } from './trust.ts';
import type { Reputation } from './trust.ts';

const PAGE = 20;
export interface SellerProfile {
  sellerId: string; alias: string; memberSince: string;
  reputation: { count: number; average: number; distribution: Reputation['distribution']; completedSales: number };
  active: PublicListing[];
  sold: { title: string; itemType: ItemType; quantity: number; photoUrl?: string; soldAt: string }[];
  reviews: { stars: number; comment: string; raterAlias: string; createdAt: string; itemTitle: string }[];
  reviewsTotal: number;
}

export async function getSellerProfile(store: Store, sellerId: string, now: Date, options: { reviewsOffset?: number } = {}): Promise<SellerProfile> {
  return store.tx(async tx => {
    const user = await tx.users.get(sellerId);
    if (!user) throw new NotFoundError('Criador no encontrado.');
    const rep = await sellerReputationIn(tx, sellerId);
    const rows = user.suspendedAt ? [] : (await tx.listings.list({ sellerId, status: 'publicada' })).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    const ops = (await tx.operations.list({ sellerId })).filter(op => op.status === 'completada');
    const completedAt = (op: (typeof ops)[number]) => op.history.find(entry => entry.status === 'completada')?.at ?? op.updatedAt;

    const sold = [];
    for (const op of [...ops].sort((a, b) => completedAt(b).localeCompare(completedAt(a))).slice(0, PAGE)) {
      const listing = await tx.listings.get(op.listingId);
      if (!listing) continue;
      const s = listing.snapshot, cover = s.photoIds?.[0] ?? s.photoId;
      sold.push({ title: s.title ?? s.name, itemType: itemTypeOf(listing), quantity: s.quantity ?? 1, ...(cover ? { photoUrl: `/api/media/${cover}` } : {}), soldAt: completedAt(op) });
    }

    const visible = [];
    for (const rating of await tx.ratings.list({ rateeId: sellerId })) {
      const op = await tx.operations.get(rating.operationId);
      if (!op || op.sellerId !== sellerId || op.status !== 'completada') continue;
      if (!reviewVisible(op, await tx.ratings.list({ operationId: op.id }), now)) continue;
      const buyer = await tx.users.get(op.buyerId), listing = await tx.listings.get(op.listingId);
      visible.push({ stars: rating.stars, comment: rating.comment, raterAlias: buyer ? aliasOf(buyer) : 'Comprador', createdAt: rating.createdAt, itemTitle: listing ? listing.snapshot.title ?? listing.snapshot.name : 'Compra' });
    }
    visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = Math.max(options.reviewsOffset ?? 0, 0);

    return {
      sellerId, alias: aliasOf(user), memberSince: user.createdAt,
      reputation: { count: rep.count, average: rep.average, distribution: rep.distribution, completedSales: rep.completed },
      active: await publicListingsIn(tx, rows, now), sold,
      reviews: visible.slice(offset, offset + PAGE), reviewsTotal: visible.length,
    };
  });
}
```

  Nota: `rating.raterId` de la reseña es el comprador; las reseñas de Ana hacia Beto (`rateeId = beto`) no entran porque se filtra por `rateeId = sellerId` y `op.sellerId === sellerId`.

- [ ] **Step 5: Ruta.**

```ts
// src/app/api/market/sellers/[id]/route.ts
import { getSellerProfile } from '@/features/market/service/seller-profile';
import { route } from '@/server/api';
import { deps } from '@/server/context';

export const runtime='nodejs';
const offset=(value:string|null)=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:0};

// Perfil público: sin sesión; solo la proyección aprobada (sin precios de ventas pasadas ni compradores).
export const GET=route({auth:false},async ctx=>getSellerProfile(deps().store,ctx.params.id,new Date(),{reviewsOffset:offset(new URL(ctx.request.url).searchParams.get('reviewsOffset'))}));
```

- [ ] **Step 6: Ejecutar**

Run: `node --experimental-strip-types --test tests/market-seller-profile.test.ts tests/market-trust.test.ts` → PASS; `npm test`, `npm run typecheck` → PASS.

---

### Task 10: Perfil del vendedor (interfaz)

**Files:**
- Create: `src/features/market/components/seller-profile.tsx`, `src/app/mercado/vendedor/[id]/page.tsx`
- Modify: `listing-card.tsx`, `listing-detail.tsx`, `operation-card.tsx`, `src/features/market/style/market.css`

**Interfaces:**
- Consumes: `GET /api/market/sellers/[id]`, `PublicListing.sellerId`, `POST /api/market/reports` (existente: `targetType: 'user'`).
- Produces: página pública `/mercado/vendedor/[id]`.

- [ ] **Step 1: `seller-profile.tsx`.** Cliente. Carga el perfil; cabecera con alias, «Miembro desde {mes año}», estrellas (`★` con `aria-label="4,5 de 5"`) y promedio, «{N} ventas completadas», «{count} opiniones»; barras de distribución 5→1 (ancho = proporción, sin división por cero); pestañas «En venta ({n})», «Vendidos ({n})», «Opiniones ({total})» como `role="tablist"`. En venta: `ListingCard` existente enlazando a `/mercado/<id>` (reutilizar el componente del catálogo público). Vendidos: tarjetas simples (foto, título, tipo, «Vendido el {fecha}»), nota «Los precios y compradores de ventas pasadas no se publican». Opiniones: estrellas, comentario, «{raterAlias} · {fecha} · Compra completada» y «Compra de {itemTitle}»; botón «Ver más opiniones» (`reviewsOffset += 20`). Botón «Denunciar al vendedor» solo con sesión (usa el diálogo/endpoint de denuncias que ya usan las publicaciones). Estados: cargando, error 404 «Este criador no existe», vacíos por pestaña. Rótulo fijo: «Reputación basada en operaciones completadas en Pico Criollo. Los datos de los animales los declara cada vendedor.»

- [ ] **Step 2: Página.** `src/app/mercado/vendedor/[id]/page.tsx` (patrón de `app/mercado/[id]/page.tsx`): `generateMetadata` simple (`Perfil del criador | Pico Criollo`), renderiza el componente con el `id` de `params`.

- [ ] **Step 3: Enlaces.** `listing-card.tsx`: el alias del vendedor pasa a un `<Link href={`/mercado/vendedor/${sellerId}`}>` con `onClick={e => e.stopPropagation()}` (sin anidar anclas: si la tarjeta entera es un `<a>`, convertir el contenedor en `div` con el enlace principal en el título). `listing-detail.tsx`: bloque «Vendedor» con alias, estrellas, «{completed} ventas» y botón «Ver perfil del vendedor». `operation-card.tsx`: la contraparte, cuando el rol es comprador, enlaza al perfil del vendedor (necesita `counterpartId`, ya disponible en `OperationView`). Añadir en la tarjeta de compra completada, bajo el formulario de calificar, el aviso: «Tu opinión será pública en el perfil del vendedor cuando el otro participante también califique o venza el plazo de 14 días».

- [ ] **Step 4: Estilos.** Reutilizar los tokens de `market.css`; barras de distribución con `role="img"` y texto alternativo; pestañas con foco visible.

- [ ] **Step 5: Verificar en navegador.** Con las cuentas del ensayo anterior: abrir `/mercado/vendedor/<id>` sin sesión (ventana sin cookies o tras cerrar sesión) y comprobar publicaciones activas, vendidas, opiniones tras calificar desde ambas cuentas, perfil de un id inexistente, perfil en móvil; captura de cada pestaña.

- [ ] **Step 6: Ejecutar** `npm run lint`, `npm run typecheck`, `npm test` → PASS.

---

### Task 11: Documentación y verificación final

**Files:**
- Modify: `docs/mercado-y-notificaciones.md`, `AGENTS.md`
- Verificación: toda la suite y el build

- [ ] **Step 1: Documentación.** En `docs/mercado-y-notificaciones.md`: ampliar la tabla «Qué es real y qué no» (lotes, perfil, factura POS interna **no fiscal**), añadir secciones «Tipos de publicación y lotes» (reglas de §3 del spec, reserva por cantidad, transferencia de stock), «Fotos», «Perfil del vendedor y opiniones» (visibilidad, reputación como vendedor), «Facturas POS» (contenido, no es DIAN, sin IVA, sin retroactivo) y actualizar el «Mapa de la API» con `/api/market/invoices`, `/api/invoices/[number]`, `/api/market/sellers/[id]`, `?type=`. Limitaciones: fotos huérfanas, compra parcial no existe. En `AGENTS.md`: nueva colección `invoices` y la regla «los bloqueos se operan por publicación con `locks.ts`».

- [ ] **Step 2: Verificación completa**

Run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
Expected: todo en verde (pruebas de PostgreSQL omitidas sin `TEST_PGDATABASE`, como antes). Cualquier fallo se corrige antes de dar la tarea por terminada; si `build` falla por algo ajeno al cambio, documentarlo.

- [ ] **Step 3: Recorrido final en navegador.** Con dos cuentas nuevas de prueba: publicar un lote de aves con 3 fotos → comprarlo → completar → verificar factura en ambas cuentas → calificar → ver el perfil público sin sesión. Registrar en el resumen final qué se probó en el navegador y qué solo con pruebas automáticas.

- [ ] **Step 4: Actualizar la memoria del proyecto** (`project-pico-criollo-mercado.md`): lotes, fotos, perfil y facturas implementados; `postgres` sigue sin probarse contra un servidor real.

---

## Self-review

**Cobertura del spec:** §3 tipos y lotes → Tasks 1–4; §4 fotos → Tasks 5–6; §5 perfil/reputación/calificar → Tasks 9–10 (la calificación ya existía; aviso de visibilidad en Task 10 Step 3); §6 factura → Tasks 7–8; §7 flujo de publicar → Task 4; §8 migración/compatibilidad → Tasks 2 y 7 (`itemsOf`, `db:migration`); §9 pruebas → distribuidas por tarea; §10 fases → orden de tareas; §11 honestidad → Global Constraints y Task 11.

**Tipos consistentes:** `ItemType`/`ListingItem` (Task 2) se usan igual en `transfer.ts` (Task 3), `invoices.ts` (Task 7) y `seller-profile.ts` (Task 9). `activeLocks`/`releaseLocks`/`reserveLocks`/`freeOperationLocks` (Task 1) son los únicos accesos a bloqueos por publicación. `PublicSnapshot.photoIds` (Task 5) lo leen `seller-profile.ts` y `listOperations`. `Reputation.distribution` (Task 9) es la única forma nueva del tipo.

**Riesgos a vigilar al ejecutar:** (1) Las pruebas existentes pueden afirmar mensajes exactos de error o la forma de `reputationIn`: ajustar solo lo estrictamente necesario y dejarlo anotado. (2) `locks.list({ lotId, ... })` y `tx.invoices.list({ number })` dependen de que el driver de archivo filtre por cualquier campo; el driver `postgres` lo hace por `jsonKey` (campos alfanuméricos). (3) El ciclo `items.ts` ↔ `snapshot.ts` se evita porque `snapshot.ts` no importa de `items.ts`. (4) Si `emptyFarmData()` de una granja antigua no trae `chickLots`/`fertileLots`/`lotMovements`, `ensureStock` los crea en las copias de la transferencia.
