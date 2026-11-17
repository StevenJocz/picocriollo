# Pico Criollo (Expo)

App única para iOS, Android y web, sobre la API de `../api` (.NET 10). Reemplaza a la app Next.js módulo por módulo.
Contexto y fases: `../docs/superpowers/specs/2026-10-22-migracion-dotnet-expo-design.md`. Sistema visual: `../DESIGN.md`.

## Estado (fase 6: paridad parcial)
**Nacimientos, grupos reproductores, anillos y ficha del ave, y ventas** (en «Más» → Ventas): vender huevos fértiles, pollitos, aves o productos con recibo, abonos, devoluciones y cancelación; lotes de huevos (crear y dividir), clientes, catálogo, trazabilidad por código y reportes del periodo. Probado en el navegador contra la API real: lote, venta con pago parcial, abono, devolución, reportes y rastro. El plan para apagar Next.js, con lo que aún falta, está en `../docs/CORTE.md`.

Imagen web: `docker build --build-arg EXPO_PUBLIC_API_URL=https://api.… -t pico-web .` (nginx; sin construir aquí por falta de Docker). La pila completa va en `../docker-compose.nueva.yml` (ver `../DEPLOYMENT.md` §9).

## Estado hasta la fase 5
Hecho y probado en web contra la API real: la entrada (bienvenida, registro, ingreso, recuperar y restablecer contraseña) y **«Mi granja»**: inicio con datos reales (resumen, postura de 7 días, próxima eclosión con cuenta regresiva, cuidados y avisos de inventario), aves (con búsqueda y filtros), recolección de huevos, inventario (existencias, compras y movimientos, con consumo), gallineros, incubación (con progreso de 21 días) y agenda (con «marcar como realizada»). Crear, editar y eliminar pasan por la API, que valida y rechaza lo que no corresponde (por ejemplo, borrar un ave con historial).

**Mercado avícola** (en «Más»): explorar y buscar, detalle con ficha y vendedor, publicar un ave o un lote de aves (precio fijo, subasta o consulta), mis publicaciones (pausar, reanudar, retirar, actualizar ficha, interesados, cancelar subasta), ofertas y «mis ofertas», pedir comprar, compras y ventas paso a paso (aceptar, pago declarado, entrega, recepción con traspaso, cancelar, disputar, contacto y valoración), mensajes y facturas. Probado en web contra la API real: oferta, solicitud, aceptación, traspaso y factura.

**Notificaciones, perfil y reels** (en «Más»): bandeja con deep links a cada pantalla, preferencias (categorías, horas de silencio, avisos push) y recordatorios de la granja; mi perfil y el de otros criadores con foto, ubicación, redes, seguir y muro; publicar con fotos o un video de YouTube, me gusta, comentarios con respuestas y compartir; y el feed de reels «Para ti» o con búsqueda y #etiquetas. Probado en web contra la API real. El push solo funciona en un teléfono con un proyecto de Expo (EAS) configurado: no se pudo probar aquí.

Faltan: publicar y transferir lotes de pollitos, huevos e insumos en el mercado, fotos y videos propios (siguen en la web), moderación y denuncias, el tiempo de visualización de cada reel (todavía solo se informan los toques en avisos), y la identificación por anillo con cámara. La búsqueda por anillo y el escaneo de aves del inicio actual **no se migraron** (no había nada real detrás todavía) y se quitaron del inicio en lugar de dejarlos de adorno.

No se ha probado en un teléfono ni en un emulador (esta máquina no tiene ninguno): iOS y Android comparten el código y compilan por TypeScript, pero falta verlos.

## Arrancar
```bash
# 1. La API (otra terminal). En Development, sin cadena de conexión, usa una base en memoria.
dotnet run --project ../api/API --urls http://127.0.0.1:5188

# 2. La app
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://localhost:5188
npm install
npm run web                 # o: npm run android / npm run ios
```
No arranques Expo con `CI=1` mientras desarrollas: apaga la vigilancia de archivos y no ves tus cambios.

## Estructura
```
src/app/         rutas (Expo Router). (auth) sin sesión; (app) con sesión: (tabs) = Inicio, Aves, Huevos, Inventario y Más, más gallineros, incubaciones, agenda, formulario/[modulo] y mercado/*; restablecer abierto a ambos
src/api/         cliente generado: openapi.json y schema.d.ts (no se editan a mano) + cliente.ts
src/auth/        sesión (tokens, refresco en una sola llamada) y almacén seguro
src/components/  Boton, Campo, Tarjeta (cristal), Pulsable, Aparece/Entrada (movimiento), Fondo, Aviso…
src/theme/       tokens de DESIGN.md: colores, radios, sombras, curvas y tiempos
src/features/social/  perfil, reels, publicaciones y comentarios (formato con pruebas, servicio y componentes)
src/features/notificaciones/  a dónde lleva cada aviso (con pruebas) y el registro del push
src/features/mercado/  formato (reglas puras, con pruebas), servicio (llamadas a la API) y componentes del mercado
src/features/granja/  modelos, cálculos puros (con pruebas), formularios por configuración, servicio de escritura y estado de la granja
tests/           `npm test`: cálculos del inicio y validación de formularios (Node, sin teléfono)
```

## Regenerar el cliente
Cuando cambie la API: levántala y ejecuta `npm run api:generar` (lee `/openapi/v1.json` y reescribe `src/api/schema.d.ts`). El compilador marca lo que se rompió.

## Sesión y seguridad
- El token de acceso (15 min) vive solo en memoria. El de refresco (30 días, rota en cada uso) va al llavero / Keystore en iOS y Android.
- En web no hay llavero: el de refresco se guarda en `localStorage`, que cualquier script de la página puede leer. Por eso rota en cada uso y reusar uno viejo cierra todas las sesiones. Si en el futuro se quiere más, la web debería usar una cookie `HttpOnly` emitida por la API.
- Un 401 en una ruta protegida renueva la sesión una vez y repite la petición; un fallo de red o un 500 no cierran la sesión.

## Movimiento
Reglas en `../DESIGN.md`. Las entradas usan `Aparece` (opacidad y desplazamiento con valores animados), no las animaciones de layout de Reanimated: en web dejan el elemento con `position: absolute` mientras dura. Respeta «reducir movimiento».

## Enlace del correo
`App__Origen` de la API debe ser la dirección pública de esta app: el correo lleva `…/restablecer?token=…`. En el teléfono, el esquema `picocriollo://restablecer?token=…` abre la misma pantalla.
