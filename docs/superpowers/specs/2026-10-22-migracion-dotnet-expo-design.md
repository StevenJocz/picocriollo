# Migración a .NET 10 (API) y Expo / React Native (iOS, Android y web)

Fecha: 2026-10-22. Decisión de la persona dueña del proyecto: opción B, un solo código Expo para los tres destinos.

## Intención
La app web actual (Next.js con lógica de servidor en Node) pasa a una API propia en .NET 10, que es lo que la persona domina, y a un cliente único Expo (React Native) que llega a iOS, Android y web. La meta es poder publicar móvil sin duplicar la lógica de negocio.

## Metas
- API en .NET 10 con la misma arquitectura de capas de `ApiTickets`: `API`, `Domain`, `Infrastructure`, `Persistence` (consultas y comandos con interfaces), más `Tests`.
- Una base de datos: la PostgreSQL actual, sin migrar datos a otro formato.
- Cliente generado desde el OpenAPI de la API (tipos que no se desfasan).
- Migrar por módulos. La app actual sigue funcionando hasta que el módulo nuevo la iguale.

## No metas
- Reescribir todo de golpe ni apagar la app actual antes de tener paridad.
- Cambiar el Dockerfile o el despliegue de la app actual mientras tanto.
- Reutilizar HTML o CSS de la web actual: la interfaz de React Native se construye con componentes nativos.

## Anti-metas (sería un fracaso aunque compile)
- Que alguien pierda su cuenta o su contraseña por el cambio de backend.
- Que dos sistemas escriban el mismo dato con reglas distintas.
- Un token de acceso guardado donde cualquier script pueda leerlo.

## Estructura
```
pico-criollo/
  api/            .NET 10: PicoCriollo.sln, API, Domain, Infrastructure, Persistence, Tests
  mobile/         Expo (React Native + TypeScript): iOS, Android y web
  src/ ...        la app Next.js actual, intacta hasta tener paridad
```
La dirección de dependencias de la API es la de `ApiTickets`: `API → Persistence → Infrastructure → Domain`.

## Decisiones tomadas
| Tema | Decisión | Quién |
|---|---|---|
| Cliente | Expo para iOS, Android y web (opción B) | la persona dueña |
| API | .NET 10 (confirmado; `ApiTickets` usa .NET 7, que ya no recibe parches), arquitectura de `ApiTickets`, con Swagger | la persona dueña |
| Identidad | JWT de acceso de 15 min + token de refresco rotativo de 30 días, guardado con hash SHA-256 | recomendación aceptada al pasar a móvil |
| Contraseñas | Se verifican con el scrypt actual y los hashes nuevos usan el mismo formato y parámetros, para que ambos sistemas se entiendan durante la transición | mi decisión |
| Base de datos | La actual. Tablas nuevas de la API con prefijo `api_` (refresco y restablecimiento), creadas con SQL idempotente | mi decisión |
| Acceso a datos | EF Core + Npgsql con `AddDbContext` (sin `new DBContext` por consulta) | mi decisión |
| Contrato | Rutas REST claras (`/api/auth/login`…) y OpenAPI en `/openapi/v1.json` | mi decisión |

## Fases
1. **API base y autenticación** (hecha): registro, ingreso, refresco, salida, «yo», olvidé mi contraseña y restablecer, con Swagger. 37 pruebas. Falta probarla contra un PostgreSQL real y construir la imagen Docker.
2. **Expo mínimo** (hecha en web): bienvenida, registro, ingreso, recuperación, restablecer e inicio, con el rediseño de `DESIGN.md` y un cliente generado desde el OpenAPI. Falta verlo en teléfono o emulador.
3. **«Mi granja»** (hecha en web, parcial): gallineros, aves, recolección, incubación, compras e inventario y agenda, con las reglas en el servidor y 72 pruebas. Pendientes de esta fase: lotes de huevos y pollitos, nacimientos, grupos reproductores, anillos y ventas, y los avisos de recordatorio.
4. **Mercado** (hecha en web, parcial): publicaciones de aves y lotes de aves (precio fijo, subasta y consulta), interesados, ofertas con clave idempotente, anti‑francotirador y cierre automático, solicitudes de compra, pago declarado, entrega, recepción con traspaso del ave entre granjas, comprobante y factura con huella, mensajes, valoraciones y procedencia; 91 pruebas de la API. Pendientes: lotes de pollitos, huevos e insumos, fotos propias, denuncias y moderación, y las notificaciones (los eventos quedan en `pc_outbox` para la app actual hasta la fase 5).
5. **Reels, perfil y notificaciones** (hecha en web, parcial): bandeja de notificaciones con preferencias, horas de silencio, recordatorios de la granja y avisos push de Expo; perfil público con redes, ubicación, foto, seguir y muro; publicaciones con fotos y videos de YouTube, me gusta, comentarios con hilos y compartir; feed de reels «Para ti» con gustos aprendidos o cronológico con búsqueda y etiquetas. 111 pruebas de la API. Pendientes: subir videos propios, comunidad de muestra, correo y navegador como canales, moderación y denuncias, reconocer razas por nombre en el texto, y probar el push en un teléfono.
6. **Paridad y apagado** de la app Next.js (en curso, **sin paridad completa**): hechos nacimientos, grupos reproductores, anillos, lotes de huevos, clientes, catálogo, ventas (abonos, devoluciones, cancelación), trazabilidad y reportes, más eventos derivados de la granja; la app y la API quedan empaquetadas (`docker-compose.nueva.yml`, `mobile/Dockerfile`, `scripts/humo-api.py`); 128 pruebas de la API y 34 de la app. **Faltan** moderación, lotes de pollitos/huevos/insumos del mercado, fotos y videos propios, correo y navegador como canales, comunidad de muestra e identificación por cámara. El plan de corte, la lista de «sí» y la marcha atrás están en `docs/CORTE.md`; Next.js no se apaga hasta cumplirla y que lo confirmes.

## Lo que sigue en manos de quien construye
Nombres de proyectos y carpetas internas, detalles de EF y el formato de los mensajes de error, siempre dentro de las convenciones de `ApiTickets`.

## Riesgos conocidos
- El scrypt actual (N=16384) está por debajo del mínimo recomendado hoy (N=32768). Se conserva por compatibilidad y se sube en una fase posterior con rehash al ingresar.
- La reescritura de interfaz a React Native es el mayor costo; no hay atajo.
- Con Expo web se pierde el renderizado en servidor de Next: los reels y el mercado públicos pierden SEO.
