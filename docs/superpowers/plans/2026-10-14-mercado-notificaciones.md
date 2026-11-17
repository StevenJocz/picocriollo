# Mercado avícola y notificaciones — plan de implementación

> **Para agentes:** usar superpowers:executing-plans (ejecución nativa en esta sesión, indicada por el usuario). Los pasos usan casillas `- [ ]`.

**Meta:** añadir mercado, subastas, operaciones, transferencia de propiedad, notificaciones, reputación y moderación a Pico Criollo, guardando local (archivo) hoy y listo para PostgreSQL mañana.

**Arquitectura:** `Pantalla → /api → servicios de dominio → Store → driver (file | postgres)`. Outbox transaccional para eventos y notificaciones. Ver spec.

**Stack:** Next.js 16 App Router, React 19, TypeScript estricto, `pg`, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-14-mercado-notificaciones-design.md`

## Restricciones globales

- Código probado por `node --test` usa **imports relativos con extensión `.ts`**, sin alias `@/` y sin enums ni parameter-properties (strip-types).
- Código de servidor nuevo no importa `next/*` salvo en rutas `src/app/api/**` y `src/server/auth.ts`.
- Interfaz en español (es-CO), moneda COP, zona horaria por defecto `America/Bogota`.
- Nada se muestra "verificado" si solo es declarado. Pagos manuales. Canales externos "No configurado" sin credenciales.
- No eliminar funciones existentes. Los comandos de calidad siguen siendo `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `.data/` se ignora en git. El driver `file` se rechaza con `NODE_ENV=production`.
- Desviación del spec (informada): las colecciones de Postgres son tablas con `id`, `data jsonb` e índices únicos/de búsqueda sobre campos clave, generadas desde una especificación declarativa; no una columna por campo.

## Foco de revisión

1. Dos peticiones simultáneas publican la misma ave → solo una gana (bloqueo único).
2. Guardar la granja con un `id` de ave ajeno o marcar `Vendido` un ave bloqueada → 409.
3. Vendedor consulta/edita publicaciones de otro vendedor → 403/404.
4. Reprocesar el outbox o repetir "Me interesa" → sin notificaciones duplicadas.
5. Archivo `.data` corrupto o ausente → arranque limpio con error claro, sin pérdida silenciosa.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `src/server/storage/types.ts` | Registros de todas las colecciones, `Store`, `Tx`, `Collection`, `CollectionSpec`, `StoreConflictError` |
| `src/server/storage/specs.ts` | Especificación declarativa de colecciones (únicos, índices) |
| `src/server/storage/file-driver.ts` | Driver archivo con mutex, copia de trabajo y escritura atómica |
| `src/server/storage/pg-driver.ts` | Driver Postgres: tablas por colecciones, mapeo de tablas heredadas |
| `src/server/storage/media.ts` | `MediaStore` (archivo / Postgres) |
| `src/server/storage/index.ts` | `getStore()`, `getMedia()`, selección por `STORAGE_DRIVER` |
| `scripts/gen-migration.ts` + `database/migrations/002_market.sql` | DDL generado desde `specs.ts` |
| `src/server/auth.ts` | Autenticación sobre `Store` |
| `src/server/api.ts` | Helpers de rutas: usuario, origen, JSON, errores |
| `src/features/market/service/*.ts` | Dominio: snapshot, listings, interest, auction, operation, transfer, reputation, moderation |
| `src/features/notifications/service/*.ts` | Dominio: events, outbox, preferences, reminders, channels |
| `src/features/market/components/*`, `src/features/notifications/components/*` | Interfaz |
| `src/app/api/**`, `src/app/mercado/**` | Rutas HTTP y páginas públicas |
| `tests/*.test.ts` | Pruebas (driver `file` en directorio temporal) |

---

## Fase 0–1: Fundación + mercado + notificaciones internas

### Tarea 1: Contrato del Store y driver `file`

**Archivos:** crear `src/server/storage/types.ts`, `specs.ts`, `file-driver.ts`; prueba `tests/store-contract.test.ts`.

**Produce:**
```ts
export interface Collection<T extends {id:string}> { get(id:string):Promise<T|undefined>; list(filter?:Partial<T>):Promise<T[]>; insert(rec:T):Promise<void>; update(rec:T):Promise<void>; remove(id:string):Promise<void>; }
export interface Tx { users; sessions; farms; ownership; ownershipHistory; listings; locks; interests; notifications; outbox; deliveries; preferences; audit; /* fases 2+: bids; operations; receipts; passports; ratings; reports; threads; messages */ }
export interface Store { tx<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>; driver:'file'|'postgres'; }
export class StoreConflictError extends Error {}
```
- [ ] Escribir prueba de contrato `runStoreContract(makeStore)`: insert/get/list/update/remove; `insert` duplicado y único violado → `StoreConflictError`; único parcial (`locks`: un solo `active` por `birdId`); **rollback**: excepción dentro de `tx` no deja cambios; persistencia: reabrir el archivo conserva datos; aislamiento: modificar el objeto devuelto no altera el almacén; archivo corrupto → error claro.
- [ ] Ejecutar: `npm test -- --test-name-pattern=store` → falla (módulo no existe).
- [ ] Implementar tipos, specs y `FileStore` (mutex, copia lazy por colección, `writeFile` temporal + `rename`).
- [ ] Ejecutar y ver pasar.

### Tarea 2: Driver Postgres, medios, migración generada

**Archivos:** `pg-driver.ts`, `media.ts`, `index.ts`, `scripts/gen-migration.ts`, `database/migrations/002_market.sql`; prueba `tests/migration.test.ts`.
- [ ] Prueba: el SQL comprometido coincide con el generado desde `specs.ts` (evita deriva).
- [ ] `PgStore`: `BEGIN/COMMIT/ROLLBACK`, `get` con `FOR UPDATE`, `insert` mapea código `23505` a `StoreConflictError`, mapeo de tablas heredadas `app_users`, `app_sessions`, `farm_data`.
- [ ] `index.ts`: `STORAGE_DRIVER`; por defecto `file` en desarrollo; en producción exige `postgres`.
- [ ] Si hay variables `PG*` la prueba de contrato también corre contra Postgres; si no, se reporta omitida.

### Tarea 3: Auth, granja y utilidades de API sobre el Store

**Archivos:** modificar `src/server/auth.ts`, `src/app/api/auth/route.ts`, `src/app/api/farm/route.ts`, `src/app/api/health/route.ts`; crear `src/server/api.ts`, `src/features/market/service/farm-guard.ts`; prueba `tests/farm-guard.test.ts`.

**Produce:** `guardFarmSave(tx, userId, previous, next): Promise<void>` (lanza `GuardError` con `status` 409).
- [ ] Pruebas: (a) registrar aves nuevas crea propiedad; (b) `id` de ave ajena → 409; (c) ave con bloqueo no puede quedar `Vendido`/`Fallecido` ni eliminarse; (d) `Transferido` no puede fijarlo el cliente; (e) lápidas no se alteran.
- [ ] Implementar guardia y cableado en `PUT /api/farm` dentro de una `tx`; conservar versión optimista y límite de 12 MB.
- [ ] `auth.ts` sin `pg` directo; conservar scrypt, cookie y mensajes.
- [ ] `GET /api/auth` y `/api/health` devuelven `storage`.

### Tarea 4: Eventos, outbox y notificaciones internas

**Archivos:** `src/features/notifications/service/{events,outbox,preferences}.ts`; prueba `tests/notifications.test.ts`.

**Produce:**
```ts
emit(tx:Tx, ev:{type:string; aggregateType:string; aggregateId:string; payload:Record<string,unknown>; dedupeKey:string; now:Date}):Promise<void>
processOutbox(store:Store, now:Date, limit?:number):Promise<{processed:number; created:number}>
EVENT_TYPES: Record<string,{category:Category; priority:Priority; critical:boolean; recipients(tx,ev):Promise<string[]>; render(tx,ev):Promise<{title:string;body:string;link:Link}>}>
defaultPreferences(userId:string):PreferencesRecord
```
- [ ] Pruebas: reprocesar el mismo evento no duplica; dos eventos con igual `dedupeKey` generan una notificación; categoría desactivada no genera (salvo crítica); la crítica ignora la preferencia; destinatarios correctos; el contenido no incluye correo ni teléfono; evento no se crea si la transacción de negocio falla.
- [ ] Implementar.

### Tarea 5: Publicaciones, snapshot, bloqueo e interesados

**Archivos:** `src/features/market/service/{snapshot,listings,interest}.ts`; prueba `tests/market-listings.test.ts`.

**Produce:**
```ts
buildSnapshot(farm:FarmDataLike, birdId:string, consent:ListingConsent, sellerAlias:string):{snapshot:PublicSnapshot; sourceHash:string; photo?:string}
createListing(store, ctx:{userId:string; now:Date}, input:ListingInput):Promise<ListingRecord>
publishListing / pauseListing / resumeListing / withdrawListing(store, ctx, id)
refreshSnapshot(store, ctx, id)
addInterest(store, ctx, listingId, message) / withdrawInterest / listInterests(store, ctx, listingId)
publicView(listing, seller):PublicListing   // única función que produce la vista pública
```
- [ ] Pruebas: ave ajena → `ForbiddenError`; ficha publicada = ficha real; `publicView` y la respuesta JSON **no contienen** notas, correo, teléfono, dirección, eventos; ave `Vendido`/`Fallecido`/ya bloqueada → error; dos `publishListing` concurrentes del mismo ave → una falla; retirar libera el bloqueo y conserva auditoría; cambiar la ficha marca `needsReview`; "Me interesa" repetido no duplica y notifica al vendedor una vez; el vendedor no puede mostrar interés en su ave; interesados solo visibles al vendedor.
- [ ] Implementar.

### Tarea 6: API HTTP de mercado y notificaciones

**Archivos:** `src/app/api/market/route.ts`, `market/[id]/route.ts`, `market/listings/route.ts`, `market/listings/[id]/route.ts`, `market/listings/[id]/interest/route.ts`, `market/mine/route.ts`, `notifications/route.ts`, `notifications/summary/route.ts`, `notifications/preferences/route.ts`, `notifications/channels/route.ts`, `profile/route.ts`, `media/[id]/route.ts`.
- [ ] Rutas delgadas: origen en métodos mutadores, JSON, usuario de sesión, validación de entrada, errores → códigos 400/401/403/404/409.
- [ ] Públicas (`GET /api/market`, `/api/market/[id]`, `/api/media/[id]`) no exigen sesión y solo devuelven `publicView`.

### Tarea 7: Interfaz Fase 1

**Archivos:** `src/features/market/components/{market-page,listing-card,listing-detail,publish-dialog,my-listings}.tsx`, `src/features/notifications/components/{bell,notification-center,preferences}.tsx`, `src/features/profile/components/profile-page.tsx`, `src/features/market/service/market-client.ts`, `src/features/market/style/market.css`; modificar `app-shell.tsx`, `module-page.tsx`, `globals.css`; crear `src/app/mercado/page.tsx`, `src/app/mercado/[id]/page.tsx`.
- [ ] Navegación: sección MERCADO (Mercado Avícola, Mis publicaciones), Notificaciones, Perfil y preferencias. Campana con contador y sondeo cada 45 s y al volver el foco.
- [ ] Botón "Publicar en el mercado" en la fila de cada ave propia.
- [ ] Catálogo público `/mercado` y detalle `/mercado/[id]`.
- [ ] Insignia de modo: "Modo local (archivo)" según `storage`.
- [ ] Verificar con el navegador integrado, móvil y escritorio.

### Tarea 8: Documentación y verificación Fase 1

- [ ] Actualizar `README.md`, `AGENTS.md`, `.env.example` (`STORAGE_DRIVER`, `JOBS_SECRET`), `.gitignore`, `DEPLOYMENT.md` (activar `postgres`).
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

---

## Fase 2: solicitudes de compra, ofertas y subastas

Tareas: (9) `AuctionRules` y `placeBid` con idempotencia, incremento, cierre y alias estables; (10) `closeDueAuctions(now)` idempotente, `POST /api/jobs/tick`, resultado y reserva; (11) solicitud de compra directa y aceptar/rechazar; cancelar subasta con reglas; (12) hilos de mensajes por publicación/operación con denuncia; (13) eventos y notificaciones comerciales; (14) UI: ofertas, subasta, "Mis ofertas y subastas", "Mis compras".
Pruebas: oferta bajo el mínimo, oferta tras cierre, vendedor ofertando, empate, reserva no alcanzada, oferta duplicada con misma clave, superada → notificación, cancelación con ofertas dentro/fuera de 24 h.

## Fase 3: pago manual, entrega y transferencia

Tareas: (15) máquina de estados de `operation` y permisos por rol; (16) `PaymentProvider` `manual`; (17) `completeTransfer` atómico con lápida, pasaporte, anillo, historial autorizado, comprobante con hash; (18) cancelación que libera bloqueos; (19) páginas de operación y comprobante `/transferencias/[código]`.
Pruebas: dos compradores simultáneos, transferencia sin duplicar ni perder historial, anillo ocupado, vendedor no dueño, cancelación libera bloqueos y conserva auditoría, ambas granjas con versión incrementada.

## Fase 4: notificaciones de incubación, salud, tareas e inventario

Tareas: (20) `scanReminders` con tres estados de eclosión distintos; (21) diffs de `PUT /api/farm` (nacimiento, mortalidad, insumo bajo); (22) horario de silencio y zona horaria; (23) UI de preferencias de anticipación.
Pruebas: estimada vs confirmada, sin duplicados con fecha sin cambios, nueva notificación si cambia la fecha, rearmado de insumo bajo.

## Fase 5: navegador, correo y push

Tareas: (24) puerto `ChannelProvider` con `delivery`, reintentos con retroceso; (25) Web Push (service worker, `manifest`) solo con claves VAPID; (26) correo solo con SMTP configurado; (27) UI de permisos explicada.
Pruebas: proveedor que falla no borra la interna; sin credenciales la app funciona y el canal figura "No configurado".

## Fase 6: reputación, moderación y antifraude

Tareas: (28) valoraciones únicas por operación; (29) `reports`, panel de moderación, `audit_log`; (30) límites de tasa y detección básica de duplicados; (31) informes comerciales.
Pruebas: valoración duplicada rechazada, sin operación completada no se valora, acciones de moderación auditadas, rol requerido en servidor.
