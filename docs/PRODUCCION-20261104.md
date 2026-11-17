# Pico Criollo — cambios del 4 de noviembre de 2026

## Servidor

Se comprobó por SSH el arranque de Ubuntu después del reinicio. Docker terminó de iniciar a las 13:00 UTC; cloudflared registró conexiones a Cloudflare a continuación. La web respondió 200 y `/api/health` respondió `status=ok, database=connected`. Docker está habilitado al arrancar y los servicios usan `unless-stopped`. El registro de errores del kernel del arranque consultado estaba vacío. Esto confirma la recuperación, no determina la causa del reinicio ni garantiza ausencia de problemas futuros.

Release: `/docker/pico-criollo/releases/20261103`. API y web se construyen con `docker-compose.nueva.yml` y `.env.api` privado del servidor. No hubo cambios destructivos de esquema. PostgreSQL y los archivos persistidos en su base se conservaron.

## Muestras verificadas

- 50 cuentas con alias Demo y correo `muestra-NN@picocriollo.test`.
- 100 gallineros, 250 aves con fotos distintas, familias, anillos, incubaciones y lotes.
- 200 posts originales con fotos distintas entre sí; cinco compartidos para mostrar esa función.
- 250 anuncios: aves, lotes de aves, pollitos, huevos e insumos. Cada anuncio tiene fotos; lotes de aves, al menos dos.
- Se retiraron las versiones antiguas de publicaciones generadas por el propio script; no se borraron publicaciones de cuentas reales.
- Fotografías ilustrativas de Commons con autor, licencia y enlace en los textos. El catálogo cubre 14 etiquetas de raza, incluida raza sin confirmar; no representa todas las razas existentes ni certifica sexo o linaje de las fotos.
- La verificación recorrió las 50 cuentas secuencialmente por API. No es una prueba de 50 sesiones concurrentes.

Estado privado y contraseñas aleatorias: `.data/demo-produccion-50.json` en el servidor; no publicar este archivo. Resultado de verificación sin secretos: `.data/demo50-verificacion.json`. Scripts reanudables; nunca ejecutarlos simultáneamente.

## Interfaz y recomendaciones

- Destacados sin filtros: top tres por ventas completadas, posts originales visibles y seguidores. Si un usuario figura en varias categorías, se agrupan sus insignias. No se inventan ventas para llenar el ranking.
- Fotos completas con `contain` en mercado, fichas y publicaciones. Reels añaden fondo ampliado desenfocado para llenar el espacio sin recortar la foto principal.
- Perfil con tarjetas tipo reel, interacciones y eliminación confirmada de publicaciones propias.
- Feed alterna autores, separa anuncios cuando hay alternativas y reserva oportunidades para autores nuevos. Usa señales existentes de interacción y visualización; es un ranking por reglas, no un modelo equivalente a TikTok.
- Original y compartidos se deduplican en Para ti. Se conservan hasta 500 reels vistos durante siete días. La búsqueda y los perfiles permiten volver a verlos.
- Encabezado de reels oculto por defecto; abre y cierra manualmente desde Explorar y su flecha. No hay temporizador ni reapertura automática por scroll.
- Descripciones largas en modal; resumen compacto en pantallas bajas; acciones centradas verticalmente a la derecha.
- Doble toque da me gusta sin alternarlo accidentalmente; muestra corazón después de confirmar la operación.
- Precarga de fotografías con concurrencia limitada, tiempo de espera y caché acotada. Se incorporan al feed al terminar la precarga; un fallo no bloquea las demás.
- YouTube: prepara reproductores cercanos mediante su API oficial y pausa los no visibles. `onReady` significa reproductor preparado, no descarga completa del streaming. Puede seguir habiendo buffering según la conexión o las restricciones del proveedor.

## Archivos principales modificados

API: `Domain/DTOs/MercadoD/MercadoDto.cs`, `Domain/Mercado/Registros.cs`, `Persistence/Commands/PublicacionCommands.cs`, `Domain/DTOs/SocialD/SocialDto.cs`, `Domain/Mercado/ReglasSociales.cs`, `Domain/Mercado/RegistrosSociales.cs`, `Persistence/Queries/SocialQueries.cs`, `Persistence/Commands/SocialCommands.cs`, `API/Controllers/SocialController.cs`.

Expo: `src/features/social/{Destacados,Reel,ReelPerfil,PerfilVista,VideoReel,VideoReel.web,componentes}.tsx`, `src/features/social/{servicio,precarga,colaPrecarga}.ts`, `src/features/mercado/{Galeria,componentes,ArbolLinaje}.tsx`, `src/features/mercado/fotos.ts`, `src/app/(app)/reels/{index,nuevo}.tsx`, `src/app/(app)/mercado/{publicar,[id]}.tsx`, fichas/lista de aves, `src/components/{CabeceraCriador,Buscador}.tsx`, contrato `src/api/{openapi.json,schema.d.ts}`.

Datos: `scripts/{demo-produccion-50,fotos-demo-commons,revisar-demo-50}.py`, `scripts/temas_demo.py`, `public/demo50/manifest.json` y fotografías.

Pruebas: `api/Tests/{FotosMercadoTests,DestacadosTests,RecomendacionTests}.cs` (8 aprobadas), `mobile/tests/precarga.test.ts` (aprobada), `npm run typecheck` (aprobado). Las suites completas no se ejecutaron. Se verificó visualmente en navegador la galería sin recorte y los destacados; la prueba en Safari físico depende del dispositivo del usuario.

## Verificación final del despliegue

Se corrigió `mobile/src/features/social/precarga.ts`: React Native Web resuelve `Image.prefetch` sin valor cuando la imagen carga, mientras que nativo devuelve un booleano. Ahora solo `false` o una promesa rechazada se consideran fallos. Antes, la comprobación de valor verdadero descartaba todas las fotos en web.

TypeScript y la prueba específica de la cola pasaron. Se ejecutaron cuatro escenarios sobre el módulo transpilado con el cargador simulado: éxito web sin valor, éxito nativo con true, false y error de red. Todos pasaron.

La imagen Docker se reconstruyó y el contenedor web se recreó correctamente. Se comprobó en producción con viewport 390 × 680: fotos visibles, acciones centradas a la derecha, doble toque cambia me gusta de 0 a 1 y repetirlo mantiene 1. Explorar abre el encabezado y la flecha lo cierra. Se restauró el viewport al terminar. Captura: `.data/reels-verificado.png`. No se probó en un iPhone físico ni se certificó descarga completa de videos de YouTube.
