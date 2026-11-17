# Pico Criollo API (.NET 10)

API de Pico Criollo con la arquitectura de `ApiTickets`: `API → Persistence → Infrastructure → Domain`, más `Tests`.
Contexto y fases de la migración: `docs/superpowers/specs/2026-10-22-migracion-dotnet-expo-design.md`.

## Estado (fase 6: paridad parcial)
Autenticación, «Mi granja» completa (gallineros, aves, recolección, incubación, compras e inventario, agenda, **nacimientos, grupos reproductores, anillos, lotes de huevos, clientes, catálogo, ventas, abonos, devoluciones, trazabilidad y reporte comercial**) y el **mercado** (publicaciones, subastas, compraventa con traspaso, facturas y mensajes).
Más el **perfil social** (perfil público, seguir, muro, me gusta, comentarios y reels) y las **notificaciones**. Quedan en la app Next.js la moderación, los videos propios, los lotes de pollitos/huevos/insumos del mercado y los canales de correo y navegador: ver `docs/CORTE.md` (matriz de paridad, lista para apagar Next.js y marcha atrás). 128 pruebas.

Rutas de la fase 6 (todas requieren token): `POST/PUT/DELETE /api/granja/{nacimientos,grupos-reproductores,clientes,productos}`, `POST /api/granja/anillos/{asignar,retirar,inhabilitar,activar}`, `POST /api/granja/eventos-ave`, `POST/PUT /api/granja/lotes-huevos` (+ `/{id}/dividir`), `POST /api/granja/ventas` (+ `/{id}/anular`, `/{id}/abonos`, `/{id}/devoluciones`), `GET /api/granja/trazabilidad?codigo=` y `GET /api/granja/resumen-comercial?desde&hasta`. Una venta es idempotente por clave, no deja vender un ave publicada en el mercado y al cancelar devuelve lo vendido a su lote o ave.

| Método y ruta | Qué hace |
|---|---|
| `POST /api/auth/registro` | Crea cuenta (correo, contraseña de 12 a 128, nombre de usuario único, ciudad opcional) y devuelve la sesión |
| `POST /api/auth/login` | Ingreso. Verifica el scrypt actual de la app Node |
| `POST /api/auth/refrescar` | Cambia un token de refresco por otro nuevo. Reusar uno viejo cierra todas las sesiones |
| `POST /api/auth/salir` | Revoca el token de refresco |
| `GET /api/auth/yo` | Datos de la persona (requiere `Authorization: Bearer <token>`) |
| `POST /api/auth/olvido-password` | Envía el enlace; responde igual exista o no la cuenta |
| `POST /api/auth/restablecer-password` | Cambia la contraseña con el enlace (30 min, un solo uso) y cierra las sesiones |
| `GET /api/granja` | La granja completa (`datos`) y su `version`. Requiere token |
| `POST/PUT/DELETE /api/granja/{gallineros,aves,recolecciones,incubaciones,compras,tareas}` | Crea, cambia y borra registros; cada orden se valida en el servidor y devuelve `{ id, codigo, version }` |
| `POST /api/granja/consumos` | Descuenta del inventario (no deja pasarse de lo disponible) |
| `POST /api/granja/tareas/{id}/completar` | Marca una tarea: calcula la próxima fecha desde hoy y consume el insumo |
| `GET /api/mercado` (abierto) | Explora publicaciones: `q`, `type`, `breed`, `species`, `sex`, `kind`, `min`, `max`, `limit`, `offset`. Lo de tu ciudad y departamento sale primero |
| `GET /api/mercado/{id}` (abierto) | Detalle público: ficha, subasta, ofertas con alias «Postor n» y qué puedes hacer tú |
| `GET /api/mercado/mias`, `POST/PUT /api/mercado/publicaciones`, `POST …/{id}/{publicar,pausar,reanudar,retirar,actualizar-ficha}` | Mis publicaciones y su ciclo de vida |
| `GET/POST/DELETE /api/mercado/publicaciones/{id}/interes(ados)` | Interesados |
| `POST …/{id}/ofertas`, `POST …/{id}/cancelar-subasta`, `GET /api/mercado/mis-ofertas` | Subastas |
| `POST …/{id}/solicitud`, `GET /api/operaciones`, `POST /api/operaciones/{id}/{responder,retirar,pago,confirmar-pago,entrega,recepcion,cancelar,disputa,compartir-contacto,valoracion}`, `GET …/{id}/contacto` | Compraventa de principio a fin |
| `GET /api/comprobantes/{codigo}`, `GET /api/facturas`, `GET /api/facturas/{numero}`, `GET /api/aves/{id}/procedencia` | Comprobante, facturas y procedencia (solo las partes) |
| `POST /api/mercado/mensajes`, `GET /api/mercado/conversaciones(/{id})` | Mensajes |
| `GET/PUT /api/perfil`, `PUT /api/perfil/{redes,ubicacion}`, `GET /api/perfiles/{id}`, `GET /api/perfiles/{id}/publicaciones`, `POST/DELETE /api/perfiles/{id}/seguir` | Mi perfil y el de los demás |
| `POST/GET/PUT/DELETE /api/publicaciones-perfil[/{id}]`, `POST …/{id}/compartir`, `PUT/GET …/{id}/me-gusta`, `GET/POST …/{id}/comentarios`, `GET …/comentarios/{id}/respuestas`, `PUT/DELETE …/comentarios/{id}` | Publicaciones, me gusta y comentarios |
| `GET /api/reels` (`antes`, `limite`, `etiqueta`, `q`, `vistos`, `semilla`), `POST /api/reels/senales` | Feed de reels y señales de lo que se mira |
| `POST /api/media?uso=post\|avatar` (el cuerpo es la foto), `GET /api/media/{id}` (abierto) | Fotos |
| `GET /api/notificaciones`, `…/resumen`, `POST …/leer`, `…/leer-todas`, `…/leer-enlace`, `GET/PUT …/preferencias`, `GET …/canales`, `POST/DELETE …/dispositivos` | Notificaciones |
| `GET /api/health` | Comprueba la base de datos |
| `GET /swagger` | Swagger UI para probar la API desde el navegador |
| `GET /openapi/v1.json` | Contrato OpenAPI que usa el cliente de Expo (`npm run api:generar`) |

Swagger y el OpenAPI están activos en Development. En producción se activan con `OpenApi__Publicar=true` (apagados por defecto: documentan toda la superficie de la API).

Errores: siempre `{ "respuesta": false, "mensaje": "…" }` con 400, 401, 409, 429, 503 o 500.

## Configuración (variables de entorno; `__` separa los niveles)
| Variable | Para qué |
|---|---|
| `ConnectionStrings__Conexion` | Cadena de Npgsql, p. ej. `Host=postgres;Port=5432;Database=bdpicocriollo;Username=postgres;Password=…` |
| `Jwt__Key` | Clave de firma, **32 caracteres o más**. La API no arranca sin ella |
| `App__Origen` | Dirección pública de la app (el enlace del correo sale de aquí) |
| `Web__Origenes__0` … | Orígenes permitidos por CORS (Expo web) |
| `Smtp__Host`, `Smtp__Puerto`, `Smtp__Usuario`, `Smtp__Clave`, `Smtp__Desde` | Correo. Sin SMTP el enlace queda en el registro del servidor |
| `Base__AplicarEsquema` | `true` (por defecto) crea las tablas que falten, sin tocar las existentes |

Tablas nuevas, propias de la API: `api_refresh_tokens` y `api_password_resets`. Las tablas `app_users`, `app_sessions` y `farm_data` son las de la app actual y no cambian.

## Desarrollo
```bash
dotnet test api/Tests/PicoCriollo.Tests.csproj   # 128 pruebas, sin base de datos real
dotnet run --project api/API               # usa appsettings.Development.json; falta ConnectionStrings__Conexion
```
Las pruebas usan una base en memoria. **Aún no se ha probado contra un PostgreSQL real** (esta máquina no tiene Docker ni Postgres): antes de apuntarla a la base de producción, levántala contra una copia y haz registro, ingreso y refresco.

## Docker
```bash
docker build -t pico-api ./api
docker run --rm -p 8080:8080 -e Jwt__Key=… -e ConnectionStrings__Conexion=… pico-api
```
En el servidor va como segundo contenedor en la red `backend`, sin publicar el puerto.

## Contraseñas
Mismo formato que la app Node: `scrypt$N$r$p$sal$hash` (base64url). Los hashes nuevos usan N=16384, r=8, p=1 por compatibilidad. N=16384 está por debajo del mínimo recomendado hoy (32768): subirlo en una fase posterior, con rehash al ingresar, cuando la app Node ya no verifique contraseñas.

## Mi granja
La granja de cada persona es **un documento jsonb** (`farm_data.data`), el mismo que usa la app Next.js. Cada orden carga el documento, aplica las reglas, y lo guarda con **control de versión**: si otra sesión guardó en medio, la segunda recibe `409` («Los datos cambiaron en otra sesión…») y no sobrescribe nada. Los campos y listas que esta API no conoce se conservan.

Los nombres del JSON (`name`, `capacity`, `startedAt`…) son los del documento, no en español, para que documento y API compartan vocabulario.

Reglas que hace cumplir el servidor (antes vivían en el navegador): capacidad, fechas y listas de opciones; gallinero y aves referidos deben existir; la clueca de una incubación en curso queda «Clueca»; incubación + consumo + venta ≤ huevos recolectados; compras suman a las existencias (y editarlas o anularlas las revierte con un ajuste, salvo que ya se consumieran); consumos no pasan de lo disponible; un gallinero con aves, un ave con historial o una incubación con nacimientos no se eliminan; un ave transferida es historial; un ave publicada en el mercado no pasa a vendida o fallecida ni se borra; completar una tarea consume su insumo.

Las reglas de nacimientos, grupos, anillos, lotes de huevos y ventas son un port fiel de `traceability.ts` y `useFarm`, incluidas sus rarezas (ver «diferencias heredadas» en `docs/CORTE.md`). Cada guardado de la granja compara el documento anterior y el nuevo para emitir los avisos (nacimiento, baja, existencias) y los recordatorios los genera `NotificacionesServicio`. El mercado se protege con el guardián `MercadoGuardia`, que lee y escribe las tablas `pc_*` de propiedad y bloqueos de aves; **no está probado contra un PostgreSQL real**.


## Mercado
Los documentos del mercado son los de las tablas `pc_*` de la app Next.js (`id text` + `data jsonb`), con su vocabulario (`sellerId`, `closesAt`, `solicitud_recibida`…): las dos apps comparten datos mientras convivan. `Coleccion<T>` lee y escribe esas tablas (listar por campo, leer con `FOR UPDATE`) y `AlmacenMercado.EjecutarAsync` abre la transacción, acumula todos los cambios y los guarda una sola vez.

Reglas que hace cumplir el servidor: la ficha pública sale de la granja real del vendedor y solo con campos permitidos; el ave queda bloqueada mientras está publicada (índice único de bloqueo activo por ave); una oferta es vinculante, idempotente por clave, debe superar el mínimo y alarga el cierre si llega en los últimos 5 minutos (hasta 12 veces); el cierre adjudica a la oferta más alta (empate: la más temprana) si alcanza la reserva y abre la operación, y lo corre `CierreSubastasServicio` cada minuto; la plataforma **no verifica pagos** (el comprador declara y el vendedor confirma); al confirmar la recepción, en la misma transacción, el ave (mismo id y código) pasa a la granja del comprador con su anillo y el historial que el vendedor autorizó, cambia el propietario, se emite el comprobante y la factura (ambos con huella sha-256) y la publicación queda vendida; teléfonos y correos no circulan en el chat hasta que la operación esté aceptada; la opinión de la otra parte se oculta hasta valorar o pasar 14 días.

**Todavía no**: lotes de pollitos, huevos e insumos (se publican y transfieren desde la app web; sus publicaciones sí se ven), fotos propias (la ficha lleva la foto si es un enlace https), denuncias y moderación, y la entrega de notificaciones: los eventos se dejan en `pc_outbox` y los convierte la app actual. **No está probado contra un PostgreSQL real** (listas por `data->>'campo'`, `FOR UPDATE` y los índices únicos); las pruebas usan la base en memoria.


## Perfil social y reels
Los documentos son los de `pc_posts`, `pc_post_likes`, `pc_post_comments`, `pc_follows`, `pc_media_items` y `pc_reel_interests` de la app Next.js, y los bytes de las fotos están en `pc_media`. Reglas: un texto no puede traer teléfonos ni correos (600 caracteres en publicaciones, 1000 en comentarios); solo se comparten videos de YouTube (el enlace se reconoce con una lista cerrada de dominios y el reproductor se construye en el servidor); los comentarios tienen dos niveles (responder a una respuesta la une al comentario principal); un comentario borrado con respuestas deja un hueco; compartir guarda solo la referencia al original y nunca forma cadenas; me gusta es idempotente. El orden «Para ti» mezcla lo reciente, la tendencia, lo cercano, lo que sigues y los gustos aprendidos (la mitad de lo aprendido se olvida cada 14 días), y reparte autores y avisos para que no sea monótono; con búsqueda o etiqueta el orden es cronológico, con lo cercano primero.

**Fotos:** `GET /api/media/{id}` no pide sesión (el id es un UUID aleatorio) para que la web las muestre en una etiqueta de imagen, que no envía el token; la app Next.js sí la pedía. Subir exige sesión, acepta JPG, PNG y WEBP (el tipo se decide por los primeros bytes) y respeta el cupo de 1 GB por persona. Los videos propios (con compresión) siguen en la app web.

## Notificaciones
`NotificacionesServicio` convierte cada 15 segundos los eventos de `pc_outbox` en notificaciones (`pc_notifications`) respetando las preferencias (`pc_preferences`): los eventos **críticos** (ventas, entregas, seguridad) ignoran la categoría apagada. Una clave (persona, evento) impide duplicados aunque se reprocese. Cada hora genera los recordatorios de cada granja (eclosión, incubación sin actualizar, tareas y cuidados de salud, grupos reproductores, existencias bajas y operaciones que esperan). Los eventos que esta API no conoce (la moderación) se dejan pendientes para la app Next.js, que los sigue procesando.

**Push:** cada teléfono registra su token de Expo (`api_dispositivos`, tabla propia). Se envía por el servicio de Expo (`Expo__AccessToken` es opcional) solo si la persona activó el canal, respetando horas de silencio (lo urgente no espera). No usa `pc_deliveries` ni `pc_push_subscriptions` para no pisar las entregas de la app Next.js. Un token que Expo da por inexistente se olvida solo.

**Todavía no:** correo y navegador como canales (los atiende la app web), y el resumen diario o semanal. Los eventos que se derivan de comparar versiones de la granja (nacimiento registrado, baja de un ave, variación de existencias) sí se emiten desde la fase 6. **Sin probar en un teléfono real ni contra PostgreSQL.**
