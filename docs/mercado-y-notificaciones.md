# Mercado Avícola, subastas, transferencias y notificaciones

Guía funcional y técnica de los módulos añadidos a Pico Criollo. El diseño completo está en `docs/superpowers/specs/2026-10-14-mercado-notificaciones-design.md` y el plan en `docs/superpowers/plans/`.

## Qué es real y qué no

| Función | Estado |
| --- | --- |
| Cuentas, sesiones, granja por usuario | Persistencia real (archivo local o PostgreSQL) |
| Mercado, subastas, solicitudes de compra, mensajes, transferencia, comprobante | Lógica real en el servidor, probada con el driver de archivo |
| Notificaciones internas, recordatorios, preferencias, reintentos de entrega | Real, probado |
| Correo (SMTP) y Web Push | Proveedores reales (`nodemailer`, `web-push`) **sin probar contra servicios reales**; probados con proveedores simulados. Solo se activan con credenciales |
| Push móvil | Puerto preparado, **sin proveedor** |
| Pagos | **No hay pasarela.** El comprador declara el pago y el vendedor lo confirma; la plataforma no lo verifica |
| Driver `postgres` | Escrito y revisado, **no probado contra un servidor real** (la suite de contrato se omite sin `TEST_PGDATABASE`) |
| Verificación de raza, genealogía, salud o identidad | **No existe.** Todo se rotula «Declarado por el vendedor» |
| Lotes (aves, pollitos, huevos), varias fotos, perfil público del vendedor, opiniones | Lógica real en el servidor, probada con el driver de archivo |
| Factura POS | **Documento interno de Pico Criollo**: no es factura electrónica de venta ni documento equivalente DIAN, no discrimina IVA y el pago figura como «confirmado por el vendedor» (no verificado) |
| Perfil con publicaciones (texto, fotos, videos), foto de perfil, nombre de usuario único | Lógica real en el servidor, probada con el driver de archivo. **Los videos se guardan tal cual: no se transcodifican ni se comprimen** (no hay ffmpeg) |
| Alertas de notificaciones y mensajes | **En vivo por SSE** (`GET /api/notifications/stream`), probado con un solo proceso. No es WebSocket. Con varias instancias (PostgreSQL) hace falta `LISTEN/NOTIFY`; mientras tanto el sondeo de respaldo cubre la diferencia |

Mientras el driver sea `file`, el sistema es de un solo proceso: sirve para desarrollo, no para varias instancias. No debe describirse como una plataforma comercial multiusuario lista para producción hasta probar PostgreSQL en una base real.

## Almacenamiento

`STORAGE_DRIVER=file|postgres`. Sin definir: `file` en desarrollo y `postgres` en producción (el archivo se rechaza con `NODE_ENV=production`). El archivo vive en `.data/pico.json` (ignorado por git) y las fotos publicadas en `.data/media/`. Un archivo dañado produce un error claro y **no se sobrescribe**.

Las colecciones nuevas son tablas `(id, data jsonb)` con índices y únicos sobre campos clave (p. ej. un único bloqueo activo por ave: índice único parcial). La granja de cada usuario sigue siendo un documento JSONB con versión optimista.

## Reglas del mercado

- Solo se publica un ave que está en **tu** granja y registrada a tu nombre; el servidor lee la ficha, no el cuerpo de la petición.
- La publicación guarda una copia pública fija de los datos que elijas. No salen notas privadas, eventos sanitarios, ventas, clientes, dirección, correo ni teléfono.
- Si cambias la ficha, la publicación pasa a «requiere revisión» y se te avisa; nada se modifica en silencio.
- Un ave tiene como máximo **un bloqueo activo** (publicación u operación): sin publicaciones duplicadas ni ventas simultáneas.
- Estados de publicación: `borrador, publicada, pausada, en_operacion, vendida, retirada, cancelada, rechazada, cerrada_sin_ofertas`.

### Subastas

- Precio inicial 1.000–1.000.000.000 COP; duración 1 hora a 30 días.
- Incremento mínimo por defecto: el mayor entre 1.000 COP y el 5 % del precio inicial (redondeado a 100); configurable.
- Precio de reserva opcional y oculto (solo se publica que existe). Extensión anti-francotirador opcional (apagada): +5 min si llega una oferta en los últimos 5 min, hasta 12 veces.
- La oferta es **vinculante, no se retira y no es un pago**. Una subasta con ofertas no se edita, pausa ni retira; solo se cancela con motivo y más de 24 h antes del cierre.
- Gana la oferta más alta que alcance la reserva; en empate, la más temprana (orden por secuencia). Sin ofertas o sin alcanzar la reserva: termina sin comprador y se puede volver a publicar. El cierre queda auditado con su regla.
- Historial público con alias estables («Postor 1»…). Cierre por `POST /api/jobs/tick` y de forma perezosa al consultar (idempotente).

### Operación comercial

`solicitud_recibida → aceptada → pago_pendiente → pago_registrado → entrega_pendiente → entrega_confirmada → completada`; `cancelada` o `disputada` desde estados no finales. Solicitar compra no vende nada: el vendedor acepta o rechaza, y al aceptar se cierran las demás solicitudes. Cancelar libera la reserva y conserva el historial y la auditoría. Una disputa mantiene el ave reservada hasta que un moderador la resuelva.

### Transferencia de propiedad

Ocurre en la **misma transacción** que la confirmación de recepción del comprador: verifica que el vendedor sigue siendo el propietario, cambia el dueño, deja una lápida `Transferido` en la granja del vendedor, crea el ave **con el mismo id y código** en la del comprador, retira/traslada el anillo (si el número ya está ocupado no se pisa nada: queda «pendiente de reasignar» y el original se guarda en el pasaporte), copia solo el historial reproductivo/sanitario que el vendedor autorizó, actualiza el pasaporte (línea de ancestros declarada) y emite el comprobante `TRF-…` con huella SHA-256. Si algo falla, nada cambia.

El comprador debe asignar gallinero al ave recibida (llega «sin gallinero»).

## Notificaciones

- Campana con contador (sondeo cada 45 s y al volver a la pestaña), centro con filtros, «marcar todas», historial y enlaces al detalle.
- **Outbox transaccional:** el evento nace en la misma transacción que el cambio de negocio; las notificaciones se crean después, con unicidad `(usuario, clave)`: sin duplicados aunque se reprocese.
- **Eclosión:** fecha estimada = inicio + 21 días + ajuste. Tres mensajes distintos: «eclosión próxima», «fecha estimada de eclosión» y «nacimiento confirmado» (solo cuando existe el registro de nacimiento).
- **Críticas** (seguridad e integridad comercial: transferencias, cancelaciones, disputas, subasta ganada o cancelada, restricciones de cuenta) no se pueden desactivar. El silencio aplaza solo los canales externos.
- Zona horaria por usuario (por defecto `America/Bogota`) para cierres y recordatorios.
- Los avisos de salud se basan en lo registrado y lo dicen: no sustituyen al veterinario.

No implementado por falta de datos en el modelo actual: movimientos de inventario «pendientes de confirmar» y revisiones de incubadoras/equipos (salvo que se registren como tareas de mantenimiento).

## Confianza y moderación

- Reputación solo de operaciones completadas: una valoración por parte y operación, dentro de 14 días; la de la otra parte se oculta hasta que valoras (o vence el plazo); en el promedio una misma persona cuenta como máximo 3 valoraciones hacia otra.
- Denuncias de publicaciones, usuarios y mensajes; con 3 cuentas distintas una publicación sin ofertas se pausa para revisión.
- Roles `moderator` y `admin` (no hay pantalla de asignación; ver `DEPLOYMENT.md`). Un moderador no modera lo suyo. Toda decisión exige nota y queda en `audit`.
- Cuentas con restricciones no pueden publicar, ofertar, solicitar, escribir ni mostrar interés.
- Límites de uso: 20 publicaciones/día, 30 ofertas/hora, 10 solicitudes/hora, 10 denuncias/día.
- El chat rechaza teléfonos y correos hasta que la operación esté aceptada; el contacto se revela solo con consentimiento de ambas partes.

## Mapa de la API

Públicas: `GET /api/market` (filtro `?type=`), `GET /api/market/sellers/[id]`, `GET /api/users/[id]/posts`, `GET /api/market/[id]`, `GET /api/media/[id]`, `/mercado`. Con sesión: `/api/market/listings`, `…/[id]` (PATCH), `…/[id]/interest|bids|purchase`, `/api/market/mine|operations|bids/mine|threads|messages|reports|insights|invoices`, `/api/media` (subida), `/api/posts`, `/api/profile/avatar`, `/api/invoices/[número]`, `/api/market/operations/[id]` (PATCH) y `…/contact|rating`, `/api/transfers/[code]`, `/api/birds/[id]/provenance`, `/api/notifications` (+ `summary`, `preferences`, `channels`, `push-subscription`), `/api/profile`. Moderación: `/api/moderation/*`. Trabajos: `POST /api/jobs/tick` con `x-jobs-secret`.


## Tipos de publicación y lotes

Una publicación vende **un ave** (`ave`), **un lote de aves** (`lote_aves`, de 2 a 50 aves de la granja), **un lote de pollitos** (`lote_pollitos`) o **un lote de huevos** (`lote_huevos`). En pollitos y huevos se elige un lote existente de la granja y una cantidad entera (1 a lo disponible). El comprador compra el lote completo; no hay compra parcial.

- El servidor lee todo de la granja del vendedor: del cliente solo toma ids y cantidad.
- `listing.birdId` es la **clave de recurso**: el id del ave, o `lote:<id de la publicación>` en los demás tipos. Las publicaciones antiguas (sin `itemType`) cuentan como `ave`.
- Bloqueos (`src/features/market/service/locks.ts`): un lote de aves bloquea **cada ave** (todo o nada); un lote de pollitos/huevos reserva una **cantidad** (`lotId`, `quantity`). Los bloqueos se operan siempre **por publicación**. Dos publicaciones del mismo lote no pueden superar lo disponible.
- Al guardar la granja, el servidor no deja un lote con menos disponibles que lo reservado ni permite eliminarlo mientras esté en el mercado.
- Transferencia (misma transacción que la confirmación de recepción): aves como antes (una lápida `Transferido` por ave); pollitos/huevos descuentan `available`/`sold` del lote del vendedor, añaden un `LotMovement` «Vendido» y crean un lote **nuevo, sin gallinero** en la granja del comprador. La fertilidad de los huevos viaja tal como el vendedor la declaró.
- Todo se rotula «Declarado por el vendedor»: la plataforma no verifica raza, edad, sexo, fertilidad ni salud.

## Fotos

Hasta 6 por publicación (JPG, PNG o WEBP; 3 MB cada una y 12 MB en total por petición). El navegador las reduce a 1600 px y JPEG 0,8 antes de enviarlas. La primera es la portada. Sin fotos subidas, un ave usa la de su ficha. Limitación conocida: al reemplazar fotos, las anteriores quedan huérfanas en el almacén de archivos (no hay borrado).

## Perfil público del vendedor y opiniones

`/mercado/vendedor/[id]` (sin sesión) muestra alias, antigüedad, reputación **como vendedor** (promedio con tope de 3 valoraciones por pareja, distribución 1–5 y ventas completadas), publicaciones activas, últimas ventas completadas (**sin precio ni comprador**) y opiniones. Una opinión se publica cuando **ambas partes ya valoraron o venció el plazo de 14 días**. El id del vendedor es un UUID y es público a propósito. Nunca se exponen correo, teléfono, notas ni granja. Un vendedor suspendido sigue visible pero sin publicaciones activas.

## Facturas POS

Al completarse una operación se emite, **en la misma transacción** que la transferencia, una factura `FAC-AAAAMMDD-XXXXXX` con huella SHA-256: una línea (el lote o el ave), medio de pago, confirmaciones de pago/entrega/recepción, comprobante `TRF-…` relacionado. La ven **solo el comprador y el vendedor** en «Mis facturas» y en `/facturas/[número]` (ticket de 80 mm imprimible). Las operaciones completadas antes de esta versión **no** tienen factura.

## Notificaciones y chats estilo Facebook

- La campana abre un **panel desplegable** (últimas 20, «Todas»/«No leídas», marcar todas como leídas, «Ver todas» lleva al historial completo).
- El botón de mensajes abre la lista de conversaciones; al elegir una se abre una **ventana de chat acoplada abajo a la derecha** (máximo 3; minimizar y cerrar). Desde una publicación o una compra, «Contactar al vendedor» / «Mensajes» abren la misma ventana. Fuera de la aplicación (catálogo público) la conversación sigue siendo en línea.
- Cuando llega una notificación o un mensaje nuevo aparece una **alerta emergente abajo a la izquierda** (8 s, hasta 3). La primera carga solo registra lo que ya existía; si la conversación ya está abierta no se repite la alerta.
- **En vivo (SSE):** el navegador abre `GET /api/notifications/stream` (`EventSource`, misma cookie de sesión). Cuando `processOutbox` crea una notificación para un usuario, `src/server/live.ts` le avisa (`event: notify`) por sus conexiones abiertas; el cliente entonces consulta el resumen y recarga las conversaciones abiertas (evento `pico-live`). El canal **no transporta datos**, solo «hay novedades». Máximo 5 conexiones por usuario (se cierra la más antigua), latido cada 25 s y reconexión automática del navegador. Con el canal conectado el sondeo baja a 60 s (chat: 30 s); si se cae vuelve a 15 s (chat: 5 s). El registro de conexiones es **en memoria de un proceso**.
- El resumen (`GET /api/notifications/summary`) separa `unread` (campana) de `unreadMessages` y `messageThreads` (mensajes). `POST /api/notifications` admite `read-link` (marca leídos los avisos de un tipo y enlace, p. ej. los mensajes de una conversación).


## Nombre de usuario, perfil público y publicaciones

- **Nombre de usuario:** se elige al crear la cuenta (2 a 40 caracteres, sin `@ < >`, enlaces ni saltos de línea) y es **único** sin distinguir mayúsculas, tildes ni espacios repetidos (`José` y `jose` chocan). Es el nombre público en el mercado, los chats y los perfiles; se puede cambiar desde «Perfil y preferencias» con la misma regla. Código: `src/server/accounts.ts`.
- **Perfil público:** `/mercado/vendedor/[id]`. Cualquier nombre de usuario que aparezca (chat, operaciones, interesados, facturas, opiniones, publicaciones) es un enlace a su perfil; dentro de la aplicación se abre en otra pestaña para no cerrar chats ni vistas. La foto de perfil de la barra superior lleva al perfil propio.
- **Novedades (el «muro»):** cada usuario publica texto, hasta 10 fotos y videos por publicación. Son públicas. El dueño las crea, edita el texto y las elimina; los demás pueden denunciarlas (los moderadores las **ocultan**; el autor la ve marcada y nadie más). Paginadas de 10 en 10, de la más nueva a la más vieja. No se permiten teléfonos ni correos en el texto (fechas y precios sí).
- **Foto de perfil:** se recorta en cuadrado (512 px) en el navegador, se sube y reemplaza a la anterior, que se borra. Se puede quitar.

### Me gusta y comentarios con hilos

- **Me gusta:** uno por persona en cada publicación (también el autor), con contador y lista de quién lo dio (`GET /api/posts/[id]/likes`: alias y foto, nunca el correo). Es idempotente: repetir la acción no duplica ni resta de más. Se actualiza al instante en pantalla y se revierte si el servidor falla.
- **Comentarios:** texto de hasta 1000 caracteres (mismas reglas que las publicaciones: sin teléfonos ni correos), del más viejo al más nuevo, de 10 en 10. Hasta **2 niveles**: comentario y respuestas. Responder a una respuesta la une al comentario principal y antepone el nombre de a quién se responde. Cada comentario principal trae una vista previa de 2 respuestas y «Ver N respuestas más» carga el resto.
- **Editar** (solo el autor, marca «editado») y **borrar** (el autor o la dueña de la publicación). Un comentario con respuestas queda como «Comentario eliminado» para no perder el hilo; sin respuestas desaparece. Borrar la publicación borra sus me gusta y comentarios.
- **Denunciar** un comentario: el moderador lo **oculta**; el autor lo ve marcado y nadie más. Las publicaciones ocultas no admiten me gusta ni comentarios.
- **Avisos** (en vivo por SSE): al autor por cada me gusta (una sola vez por persona, aunque lo quite y lo vuelva a poner) y por cada comentario nuevo a su publicación; a quien reciba una respuesta. Nunca por lo propio. El enlace lleva a `/mercado/vendedor/<autor>?post=<id>`, con esa publicación destacada y los comentarios abiertos. Si se abre una publicación con los comentarios a la vista, se recargan al llegar un aviso.
- Límite: 60 comentarios por hora por persona.
- API: `POST /api/posts/[id]/like {liked}`, `GET|POST /api/posts/[id]/comments`, `GET /api/comments/[id]/replies`, `PATCH|DELETE /api/comments/[id]`, `GET /api/posts/[id]`.

### Archivos: formatos, compresión y límites

- Formatos: fotos JPG, PNG, WEBP; videos MP4, WEBM, MOV. El tipo se decide por los **primeros bytes** del archivo, no por lo que declare el cliente (HEIC, GIF, PDF, HTML disfrazado, etc. se rechazan).
- **Compresión de fotos (en el navegador):** la foto completa se guarda «**visualmente sin pérdida**»: WebP calidad 0,92 y hasta 3000 px de lado mayor (una foto de 4000×3000 de 1,6 MB quedó en 344 KB, 3000×2250). Si el original ya es JPG/WEBP de hasta ~1,2 MB se conserva **tal cual**; si re-codificar lo dejara más pesado, también. Además se guarda una **miniatura** de 720 px para que el muro cargue rápido. El visor muestra siempre la versión completa (sin recomprimir) y ofrece «Abrir original». No es una copia bit a bit del archivo original cuando se re-codifica.
- Videos: hasta 60 MB cada uno, tal cual; se genera un póster desde un fotograma. Se sirven con `Range` (se pueden adelantar).
- Límites: foto 12 MB (tras comprimir), foto de perfil 3 MB, miniatura 1,5 MB, 10 archivos por publicación, **1 GB por usuario**, 120 archivos por hora y 30 publicaciones por día.
- Los archivos subidos y nunca usados (publicación abandonada, foto de perfil no elegida) se borran pasado un día con `POST /api/jobs/tick`. Al borrar una publicación se borran sus archivos.
- API: `POST /api/media?purpose=post|avatar&thumbOf=&w=&h=` (cuerpo binario), `GET /api/media/[id]` (fotos y videos, con `Range`), `POST /api/posts`, `PATCH|DELETE /api/posts/[id]`, `GET /api/users/[id]/posts`, `PUT /api/profile/avatar`.

## Diálogos de la aplicación

No se usan `window.prompt/confirm/alert`: algunos navegadores integrados no los soportan (`prompt() is not supported`) y rompían acciones como «Declarar pago realizado». Se usa `useDialogs()` (`src/shared/components/dialogs.tsx`): `ask`, `confirm`, `rate` y `notify`, con validación en el propio diálogo, atajos de medios de pago y teclado (Enter, Esc, Tab).
