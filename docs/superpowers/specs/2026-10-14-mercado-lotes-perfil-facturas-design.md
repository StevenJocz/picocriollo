# Mercado: lotes, varias fotos, perfil del vendedor, opiniones y factura POS — diseño

Fecha: 2026-10-14. Estado: diseño aprobado en conversación; pendiente de revisión de este documento.
Amplía `2026-10-14-mercado-notificaciones-design.md`. No reescribe lo existente: reutiliza `Store`, bloqueos, operaciones, transferencia, valoraciones y outbox.

## 1. Objetivo y alcance

Cuatro peticiones del usuario, más una añadida durante el diseño:

1. Al publicar se elige qué se vende: **un ave** o **un lote** (de aves, de pollitos o de huevos).
2. Una publicación admite **varias fotos**.
3. Cualquier persona, con o sin sesión, ve el **perfil público del vendedor**: reputación, lo que tiene en venta, lo que ya vendió y las opiniones recibidas.
4. El comprador **califica y opina** sobre una compra completada (ya existe; se hace visible en el perfil).
5. Al completarse una venta se emite una **factura POS** y comprador y vendedor la ven en «Mis facturas».

### Fuera de alcance

- Compra parcial de un lote (el comprador siempre compra el lote completo).
- Factura electrónica DIAN, IVA discriminado, resoluciones de numeración. La factura es un documento interno de Pico Criollo.
- Facturas de operaciones completadas antes de esta versión (no se reconstruyen).
- Borrado de archivos de `MediaStore` al reemplazar o retirar fotos (el almacén no tiene `delete`; las fotos huérfanas quedan).
- Respuesta del vendedor a una opinión; reordenar fotos (la primera es la portada; se puede quitar y volver a subir).
- Registrar la venta del mercado como `Sale` en el módulo de ventas de la granja del vendedor.

## 2. Hechos del código actual en los que se apoya

- `ListingRecord` guarda `birdId`; `BirdLockRecord` tiene un único bloqueo activo por `birdId` (índice único parcial); `OperationRecord.birdId` y `executeTransfer` asumen un ave.
- La granja es un documento por usuario (`FarmData`) que el cliente guarda completo con versión optimista; `guardFarmSave` valida propiedad y bloqueos.
- La granja ya tiene `chickLots: ChickLot[]` (`initial`, `available`, `sold`, `breed`, `coopId`…) y `fertileLots: FertileEggLot[]` (igual, más `productType` y `fertility`) y `lotMovements`.
- La foto de una publicación sale de `bird.photo` (data URL) y se copia a `MediaStore` en `fillSnapshot`. `GET /api/media/[id]` sirve imágenes sin sesión.
- Valoraciones: `rateOperation` (1–5 y comentario, 14 días, una por parte), `ratingStateIn` oculta la de la otra parte hasta que se valora o vence el plazo, `reputationFrom` limita a 3 valoraciones por pareja. `publicProfile` solo devuelve alias y reputación.
- Comprobante `TRF-…` con huella SHA-256 (`transfer.ts`), visible solo para las dos partes.

## 3. Publicaciones por tipo

### 3.1 Modelo

```ts
export type ItemType = 'ave' | 'lote_aves' | 'lote_pollitos' | 'lote_huevos';
export type ListingItem =
  | { type: 'ave'; birdId: string }                                   // lote_aves tiene N de estos
  | { type: 'lote_pollitos' | 'lote_huevos'; lotId: string; quantity: number };
```

`ListingRecord` añade `itemType: ItemType` y `items: ListingItem[]`. Un registro sin `itemType` se lee como `ave` con `items = [{ type:'ave', birdId }]` (función `itemsOf(listing)`; no hay migración de datos).

`listing.birdId` sigue siendo obligatorio y funciona como **clave de recurso**: el id del ave en `ave`; `lote:<listingId>` en los otros tipos. Así `OperationRecord.birdId`, recibos y consultas existentes no cambian de forma.

Reglas de contenido:

| Tipo | Origen | Validación en el servidor |
| --- | --- | --- |
| `ave` | 1 ave de la granja | Como hoy |
| `lote_aves` | 2 a 50 aves de la granja del vendedor, sin repetidas | Cada ave: de su granja, registrada a su nombre, no `Vendido`/`Fallecido`/`Transferido`, sin bloqueo activo |
| `lote_pollitos` | 1 `ChickLot` de su granja + `quantity` | `quantity` entero ≥ 1 y ≤ `available` menos lo ya reservado por otras publicaciones activas del mismo lote |
| `lote_huevos` | 1 `FertileEggLot` de su granja + `quantity` | Igual. La fertilidad se publica tal como está registrada; nunca se afirma como verificada |

El cliente envía solo ids y `quantity`; nombre, raza, edad, etc. se leen de la ficha en el servidor.

### 3.2 Bloqueos

- `ave`: un bloqueo por `birdId`, como hoy.
- `lote_aves`: **un bloqueo por ave** (todos con el mismo `listingId`). Todo o nada dentro de la transacción: si falla uno, no se crea ninguno.
- `lote_pollitos`/`lote_huevos`: un bloqueo con `birdId = lote:<listingId>`, y los campos opcionales nuevos `lotId` y `quantity`. La disponibilidad se valida dentro de `store.tx` sumando los bloqueos activos del mismo `lotId`.
- Los bloqueos de una operación se buscan por `listingId` (no por `birdId`) en `respondPurchase`, `releaseOperationLocks`, `executeTransfer` y el cierre de subastas. `operationId` se asigna a todos los bloqueos del listado.
- `guardFarmSave` añade: no se puede quitar, vender ni dejar un lote con `available` menor que la suma reservada por publicaciones activas del vendedor; ni eliminar el lote. Mismo mensaje que hoy: «está en el mercado, retira la publicación».
- Retirar, cancelar, rechazar, cerrar sin ofertas o cancelar la operación liberan todos los bloqueos de la publicación.

### 3.3 Instantánea pública

`PublicSnapshot` añade `itemType`, `quantity` (unidades del lote; 1 en `ave`), `title`, `photoIds` y `items` públicos:

- `ave`: sin cambios (`name`, `code`, `ring`, `breed`, `sex`, `bornAt`, `ageLabel`, genealogía…). `title = name`.
- `lote_aves`: lista de `{ name, code, sex, breed, ageLabel }` por ave. Sin anillo, genealogía ni notas. `title` generado: «Lote de N aves» (+ raza si es única).
- `lote_pollitos`: `title` «Lote de N pollitos <raza>», `quantity`, `breed`, edad calculada del nacimiento si existe.
- `lote_huevos`: `title` «Lote de N huevos <fértiles|de consumo>», `quantity`, `breed`, `fertility` tal como figura («Pendiente», «Confirmada»…).
- Todo sigue rotulado «Declarado por el vendedor». `name`, `code`, `breed` y `sex` se rellenan (código del lote, `'Mixto'` si hay varios sexos) para no romper tarjetas y filtros existentes.

`sourceFingerprint` pasa a calcularse por tipo: para aves, la huella de cada ave; para lotes, `breed`, `fertility`/`productType` y `available >= quantity`. `flagListingsForReview` la usa igual que hoy (marca «requiere revisión», no modifica en silencio).

### 3.4 Transferencia

`executeTransfer` se divide por tipo; todo dentro de la transacción que confirma la recepción:

- `ave`: sin cambios.
- `lote_aves`: aplica el flujo de `ave` a cada ave, con las mismas verificaciones; si una falla, se revierte todo. Una lápida `Transferido` por ave en la granja del vendedor.
- `lote_pollitos`/`lote_huevos`: verifica que el vendedor sigue teniendo `available >= quantity`; en su lote `available -= quantity` y `sold += quantity`; añade `LotMovement` `Vendido` con `referenceId = operationId`. En la granja del comprador crea un lote nuevo (`ChickLot`/`FertileEggLot`) con `initial = available = quantity`, `coopId: ''`, misma raza, `notes` con la procedencia («Transferido por <alias> el <fecha>»), y para huevos `fertility` tal como se declaró. Código nuevo con el generador existente de la granja del comprador.
- En los tres casos: publicación `vendida`, bloqueos liberados, operación `completada`, comprobante `TRF-…` (campos `birdName`/`birdCode` pasan a llevar el `title` y el código del lote), factura (sección 6) y eventos.
- Pasaporte y procedencia (`passports`, `ownershipHistory`) solo existen para aves individuales.

## 4. Varias fotos

- Entrada: `photos?: string[]` (data URLs) al crear o editar la publicación. Máximo 6. Cada una: `image/png|jpeg|webp`, ≤ 3 MB decodificada (reutiliza `parsePhoto`); tamaño total de la petición ≤ 12 MB.
- El navegador reduce cada imagen a 1600 px de lado mayor, JPEG calidad 0,8, antes de enviarla (componente `photo-picker.tsx`: seleccionar varias, miniaturas, quitar).
- `fillSnapshot` guarda cada foto en `MediaStore` con un UUID nuevo y deja `snapshot.photoIds: string[]`. `photoId` se conserva igual a `photoIds[0]` para registros antiguos.
- En `ave`, si el vendedor no subió fotos y `consent.showPhoto` está activo, se usa `bird.photo` como única foto (comportamiento actual).
- Editar fotos de una publicación (borrador, publicada o pausada) reconstruye `photoIds`. Una subasta con ofertas no admite cambios (regla existente).
- `publicView` expone `photoUrls: string[]` (`/api/media/<id>`) y `photoUrl` (la primera) por compatibilidad. La tarjeta muestra la portada; el detalle, una galería con miniaturas.
- Lotes: las fotos son opcionales pero se recomiendan (aviso en el diálogo).
- Limitación conocida: al reemplazar fotos las anteriores quedan en el almacén.

## 5. Perfil público del vendedor y reputación

### 5.1 API

`GET /api/market/sellers/[id]` (`auth: false`) → `getSellerProfile(store, sellerId, now)`:

```ts
interface SellerProfile {
  sellerId: string; alias: string; memberSince: string;
  reputation: { count: number; average: number; distribution: [number, number, number, number, number]; completedSales: number };
  active: PublicListing[];                 // publicaciones en estado 'publicada', más recientes primero
  sold: { title: string; itemType: ItemType; quantity: number; photoUrl?: string; soldAt: string }[];  // últimas 20
  reviews: { stars: number; comment: string; raterAlias: string; createdAt: string; itemTitle: string }[];  // últimas 20 con «cargar más»
}
```

- Reputación del perfil = valoraciones recibidas **como vendedor** (la operación tiene `sellerId = vendedor`), con el tope por pareja de `reputationFrom`. `completedSales` = operaciones `completada` como vendedor.
- Para coherencia, `sellerReputation` de tarjetas y detalle pasa a usar el mismo cálculo (nueva `sellerReputationIn`). Hoy mezcla compras y ventas: es un cambio de comportamiento y se actualizan las pruebas de `market-trust`.
- `sold` sale de operaciones completadas y la instantánea de su publicación. **No** incluye precio, comprador, ni anillo/código de aves.
- `reviews`: una opinión se muestra cuando ambas partes ya valoraron o venció el plazo de 14 días (regla de `ratingStateIn`, evita represalias). El promedio sigue calculándose con todas las valoraciones recibidas, como hoy; se acepta esa diferencia menor.
- Cuentas suspendidas: el perfil sigue visible, sin publicaciones activas.
- Nunca se exponen correo, teléfono, granja ni notas.

### 5.2 Interfaz

- Página pública `/mercado/vendedor/[id]` (`src/app/mercado/vendedor/[id]/page.tsx`) con componente `seller-profile.tsx`: cabecera (alias, miembro desde, estrellas, «N ventas completadas»), barra de distribución 1–5, pestañas «En venta», «Vendidos» y «Opiniones».
- `PublicListing` añade `sellerId`. El alias del vendedor en `listing-card` y `listing-detail` enlaza al perfil (el id queda visible en la URL; es un UUID aleatorio, no un dato personal).
- Un botón «Denunciar» al vendedor reutiliza `reports` con `targetType: 'user'`, solo con sesión.

### 5.3 Calificar y opinar

Sin cambios de reglas: 1–5 estrellas y comentario de hasta 500 caracteres sin teléfonos ni correos, solo tras `completada`, una por parte, 14 días. La tarjeta de la compra (`operation-card`) ya ofrece calificar; se añade un aviso «Tu opinión será pública en el perfil del vendedor cuando el otro participante también califique o venza el plazo».

## 6. Factura POS

### 6.1 Registro

Colección nueva `invoices` (tabla `pc_invoices`), únicos en `number` y `operationId`, índices en `sellerId` y `buyerId`:

```ts
interface InvoiceLine { description: string; detail: string[]; itemType: ItemType; unit: 'ave' | 'lote'; quantity: 1; unitPrice: number; total: number; }
interface InvoiceRecord {
  id: string; number: string;                 // FAC-AAAAMMDD-XXXXXX
  operationId: string; listingId: string; receiptCode: string;   // TRF-… relacionado
  sellerId: string; buyerId: string; sellerAlias: string; buyerAlias: string;
  lines: InvoiceLine[]; subtotal: number; total: number; currency: 'COP';
  paymentMethod?: string; paymentDeclaredAt?: string; paymentConfirmedAt: string;
  deliveredAt: string; receivedAt: string; issuedAt: string; hash: string;
}
```

- `lines`: una sola línea por operación. `description` = `title` de la publicación; `detail` = contenido (por ejemplo, nombres/códigos de las aves del lote, o «12 pollitos Brahma»). `quantity` es 1 y `unit` indica `ave` o `lote`, para no repartir un precio en fracciones.
- `subtotal = total = operation.price`. No hay línea de impuestos: la factura dice «Sin IVA discriminado».
- Los alias de comprador y vendedor se congelan en la factura. Sin direcciones, correos ni teléfonos.
- `hash` = SHA-256 del contenido canónico (mismo patrón que `receiptHash`); `verifyInvoice` detecta alteraciones.

### 6.2 Emisión

`issueInvoice(tx, op, listing, receipt, now)` se llama desde `executeTransfer`, **dentro de la misma transacción**: la factura existe si y solo si la operación se completó. Un fallo cancela toda la transferencia. Idempotencia por único en `operationId`.

Evento `market.invoice.issued` al outbox (registrado en `event-registry.ts`): notificación a comprador y vendedor con enlace a la factura, no crítica. Fecha en la zona del usuario.

### 6.3 Acceso y pantallas

- `GET /api/market/invoices?role=comprador|vendedor` → lista del usuario de sesión (número, fecha, título, total, contraparte, rol).
- `GET /api/invoices/[number]` → detalle, solo si el usuario es comprador o vendedor; otro usuario recibe 403. Incluye `integrity` (huella coincide).
- Vista «Mis facturas» en el `AppShell` (`facturas`, en `MARKET_VIEWS`, ítem de menú con ícono `receipt`): tabla con filtro Compras/Ventas, búsqueda por número y enlace al detalle.
- Página `/facturas/[number]` con componente `invoice-view.tsx`: ticket POS de 80 mm (monoespaciado, líneas punteadas), botón «Imprimir o guardar PDF» y estilos `@media print` con `@page { size: 80mm auto }`. Pie obligatorio: «Documento interno de Pico Criollo. No es factura electrónica de venta ni documento equivalente DIAN. El pago fue confirmado por el vendedor; la plataforma no lo verifica».
- `operation-card` muestra «Ver factura FAC-…» junto al comprobante `TRF-…` cuando la operación está completada. `OperationView` añade `invoiceNumber`.

## 7. Publicar: flujo de interfaz

- `PublishDialog` pasa a recibir `initialType` y un selector de tipo en la parte superior (cuatro opciones con descripción de una línea). Desde la ficha del ave abre en `ave`; desde «Mis publicaciones» un botón «Nueva publicación» abre en el selector.
- Fuentes por tipo: una ave (select), varias aves (lista con casillas y buscador), un lote de pollitos o de huevos (select de lotes con `available` menos reservado) + cantidad.
- Sección «Fotos» con `photo-picker`. Resto del diálogo (precio fijo, subasta, interés, descripción, zona, consentimientos) sin cambios; los consentimientos de genealogía/reproducción/historial solo aplican a `ave` y `lote_aves`.
- Catálogo (`market-page`, `listing-card`): insignia del tipo y cantidad; filtro nuevo `type` (`GET /api/market?type=`).

## 8. Datos, migración y compatibilidad

- `specs.ts`: añadir `invoices`; `Tx` gana `invoices: Collection<InvoiceRecord>`. Ejecutar `npm run db:migration`; la prueba de migración debe pasar.
- Campos nuevos en listados y bloqueos son opcionales o derivados (`itemsOf`), así que los registros existentes y el archivo `.data/pico.json` siguen funcionando sin conversión.
- API pública `PublicListing`: campos nuevos aditivos; `photoUrl` se mantiene.
- Tras implementar: actualizar `docs/mercado-y-notificaciones.md` (tipos, fotos, perfil, facturas, límites) y `AGENTS.md` si cambian convenciones.

## 9. Pruebas obligatorias (`node --test`, driver de archivo)

- Publicar cada tipo; rechazo de aves ajenas, repetidas, vendidas o ya bloqueadas; lote con una ave inválida no crea ningún bloqueo.
- Cantidad de pollitos/huevos: mayor que la disponible, cero, decimal, y dos publicaciones del mismo lote que juntas exceden `available`.
- `guardFarmSave`: no se reduce `available` por debajo de lo reservado ni se elimina un lote reservado.
- Instantánea de lotes: sin anillo, genealogía, notas ni datos privados.
- Fotos: máximo 6, tipo inválido, tamaño excesivo, orden y portada, compatibilidad con `photoId`; subasta con ofertas no cambia fotos.
- Transferencia: lote de aves (todo o nada), lote de pollitos y de huevos (descuento al vendedor, lote nuevo al comprador, `LotMovement`), liberación de bloqueos al cancelar.
- Factura: emitida solo al completar, una por operación, contenido por tipo, huella verificable, acceso solo de comprador y vendedor (403 a terceros), listado por rol, nada emitido si la transferencia falla.
- Perfil: solo datos públicos, `sold` sin precio ni comprador, opiniones ocultas hasta que ambas valoran o vence el plazo, reputación solo como vendedor, vendedor suspendido sin publicaciones activas.
- Regresión: `market-listings`, `market-purchase`, `market-transfer`, `market-trust` existentes siguen pasando (ajustando `market-trust` a la reputación como vendedor).

## 10. Fases del plan

1. **Tipos y lotes**: modelo, bloqueos, instantánea, guard de granja, transferencia por tipo; filtro y tarjeta; selector en el diálogo.
2. **Varias fotos**: subida, almacenamiento, galería.
3. **Factura POS**: colección, emisión, API, «Mis facturas», ticket imprimible, evento.
4. **Perfil y opiniones**: API pública, página, enlaces desde tarjeta y detalle, reputación como vendedor.

Cada fase deja la aplicación funcionando y con pruebas en verde.

## 11. Honestidad sobre el alcance

Todo sigue siendo «Declarado por el vendedor»; la plataforma no verifica raza, edad, fertilidad, sexo ni salud de los lotes. La factura es un documento interno con huella de integridad, no un documento tributario. El pago continúa siendo manual y confirmado por el vendedor. El driver `postgres` sigue sin probarse contra un servidor real.
