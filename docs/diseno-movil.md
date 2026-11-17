# Diseño móvil-primero

Lenguaje visual: degradados verdes suaves, tarjetas de vidrio esmerilado, esquinas redondeadas (20–28 px), botones en píldora con degradado, titulares grandes en Manrope con una palabra en verde, barra inferior flotante y diálogos como hojas inferiores en teléfono. Decisiones y alcance: `docs/superpowers/specs/2026-10-19-rediseno-movil-design.md`.

## Capa «moderna» (`src/app/modern.css`)

Se carga después de `theme.css` y solo cambia tokens y detalles: fondo pastel (menta, cielo, lila, durazno) con deriva lenta, cristal más limpio con relieve al pasar el cursor, tarjetas que aparecen al entrar en pantalla (`animation-timeline: view()`, donde el navegador lo permite), tira de categorías deslizable en el inicio, banner con cuenta regresiva a la próxima eclosión (`HatchBanner` en `dashboard.tsx`; solo aparece si hay una incubación en curso) y las pantallas de recuperación de contraseña. Respeta `prefers-reduced-motion`. Para revertirla basta quitar el archivo y su import en `layout.tsx`.

## Piezas

- `src/app/theme.css`: capa de tema cargada al final (tokens `--grad`, `--glass`, `--r-lg`…, superficies de vidrio, botones, campos, barra lateral, inicio, entrada, barra inferior `.m-dock`, hojas inferiores, tablas como tarjetas en móvil, páginas públicas, chat a pantalla completa). Usa el prefijo `body …` para ganar a los CSS heredados. Revertir el rediseño = quitar este archivo y su import en `layout.tsx`.
- `src/app/mobile-type.css`: **generado** por `npm run css:mobile` (`scripts/gen-mobile-type.ts`) a partir de los tamaños de letra de los CSS de `src/`. Por debajo de 900 px sube cada tamaño menor a 16 px de forma proporcional (7 px → 11.5 px, 10 px → 13 px) y conserva el orden; el escritorio no cambia. Una prueba (`tests/mobile-type.test.ts`) falla si el archivo queda desactualizado: vuelve a ejecutar el script tras cambiar tamaños de letra.
- `app-shell.tsx`: barra inferior (`DOCK`: Inicio, Aves, Mercado, Avisos, Más), encabezado móvil con avatar y nombre.
- `dashboard.tsx`: inicio con saludo, buscador, tarjeta principal y accesos rápidos.
- `auth-screen.tsx`: entrada con portada y tarjeta de vidrio.

## Fotos de gallinas

Las pantallas de portada, inicio («Identificar ave», «Aves recientes») e identificación usan ranuras de foto en `public/fotos/` (nombres y medidas en `public/fotos/LEEME.md`). El componente `src/shared/components/photo.tsx` muestra un emoji de respaldo mientras el archivo no exista, así que basta con copiar las fotos con los nombres indicados. Usa solo fotos propias o con licencia de uso comercial.

## Reglas al añadir pantallas

- Objetivos táctiles de al menos 44 px y campos con `font-size: 16px` (evita el zoom de iOS).
- Las tablas de registros se convierten en tarjetas con `data-label` en cada celda (ver `module-page.tsx`); una tabla nueva solo necesita esa clase `actions-head` y los `data-label`.
- Acciones principales abajo y al alcance del pulgar; el contenido deja `calc(var(--dock-h) + 40px)` libres para la barra inferior.
- Respeta `prefers-reduced-motion` (ya global) y no uses tamaños de letra fijos menores de 12 px en CSS nuevo.
- No pongas `transform`, `filter` ni `backdrop-filter` en `.content-area` ni en sus padres: crean un bloque contenedor y las ventanas `position: fixed` (diálogos, hojas inferiores) dejarían de anclarse a la pantalla y aparecerían al final del contenido. La animación de entrada de pantalla usa solo `opacity`.
- Grupos de botones dentro de una ventana: usa `.dialog-actions` (rejilla de 2 columnas; un botón solo ocupa el ancho completo). En el pie de un diálogo la acción principal va primero y a todo el ancho.
- Mercado: la descripción de la publicación se escribe al publicar («Descripción de la publicación», arriba del precio) y se edita después con «Editar descripción» en «Mis publicaciones» (`PATCH /api/market/listings/:id` con `action: 'update'`). La tarjeta muestra un extracto de dos líneas.

## Sistema de iconos y movimiento (pase «premium»)

- **Iconos:** `src/shared/components/icon.tsx` usa [Lucide](https://lucide.dev) (`lucide-react`, trazo 1.8 px). Se conservan los nombres de siempre (`house`, `bird`, `egg`…); para añadir uno, impórtalo y regístralo en `ICONS`. `IconBadge` pone el icono sobre un contenedor con degradado (`green|gold|blue|rose|slate`).
- **Sin emojis como icono:** aves, huevos y lotes sin foto muestran `BirdGlyph` (`glyph.tsx`; `glyphForSex`, `glyphForItem`). `Photo` recibe un `GlyphKind` como respaldo.
- **Contadores:** `CountUp` (`count-up.tsx`) anima los números de las métricas y respeta «reducir movimiento».
- **Entrada y salida:** tarjetas y bloques entran escalonados (`rise`), los diálogos de `useDialogs` también animan la salida (`data-closing`), los avisos llevan cuenta atrás. Todo con `opacity` y `transform` solo en los hijos.
- **Formularios:** casillas y radios propios, validación inmediata con `:user-invalid`/`:user-valid`, botones con `aria-busy` (indicador giratorio).
- **Datos de muestra:** las cuentas de muestra usan UUID fijos (`src/server/demo-ids.ts`); en PostgreSQL `app_users.id` es `uuid` y un id de texto hacía fallar el alta de cuentas (503).
- **Reels:** el buscador general (`reel-search.ts`, `GET /api/reels?q=`) busca en publicaciones (texto, etiquetas, autor) y en avisos del mercado (raza, tipo de ave, nombre, código, descripción, zona, salud, criador, tipo de venta; «mercado» filtra solo avisos). Todos los términos deben coincidir; sin tildes ni mayúsculas, con plural simple. El feed carga en continuo: un observador dentro del contenedor con scroll pide la página siguiente 1400 px antes del final.
- **Videos enlazados:** una publicación puede llevar un enlace de YouTube, TikTok o Instagram (campo `videoUrl` de `POST /api/posts`, o el primer enlace compatible del texto si no hay archivos). `video-links.ts` valida con lista cerrada de dominios y extrae el id; la URL del reproductor la construye el servidor (`embedUrl`) y se guarda solo proveedor, id y enlace canónico (`PostRecord.embed`). `VideoEmbed` muestra primero una vista previa ligera y carga el iframe (con `sandbox`) solo al pulsar reproducir. Enlaces cortos de TikTok (`vm.tiktok.com`) no se aceptan: hay que pegar el enlace completo. YouTube está verificado de punta a punta; TikTok e Instagram usan su formato oficial de incrustación, pero su render depende de que la plataforma lo permita para cada video (siempre queda el enlace «Abrir en…»).
- **Reproducción automática en los reels:** solo se reproduce el reel que se está mirando (≥ 60 % visible; `reel-playback.ts`, `pickActiveReel`). Los videos subidos arrancan solos y en silencio, se pausan al salir y retoman al volver; los de YouTube cargan su reproductor solo mientras el reel está activo (modo «limpio»: sin controles, tocar pausa/reanuda) y se descargan al salir; TikTok e Instagram cargan/descargan su reproductor pero deciden ellos si arrancan solos. Un botón de sonido (🔊 en la tarjeta) activa el audio de todos. `useSingleVideoPlayback` pausa cualquier otro `<video>` cuando uno empieza, y en el muro del perfil iniciar un video enlazado devuelve los demás a su vista previa.
- **Video nativo:** no se puede reproducir el archivo de YouTube/TikTok/Instagram con el reproductor de la app (las plataformas solo permiten su reproductor incrustado; sacar el archivo va contra sus términos). Para un reproductor 100 % propio, el usuario sube el archivo (hasta 60 MB).
- **Fluidez del scroll en reels:** tarjetas fuera de pantalla con `content-visibility: auto` + `contain` (altura intrínseca igual a la real para que el scroll no salte), sin `backdrop-filter` sobre contenido en movimiento (barra inferior y etiquetas con fondos translúcidos), `scroll-snap-stop: always`, `ReelCard` memoizada, videos con `preload="none"` salvo el activo y el siguiente, y el reproductor de un reel solo se monta tras `DWELL_MS` (280 ms) de estar activo, para no cargar videos al pasar rápido. Medición en el navegador integrado (14 deslizamientos): el cuadro más lento bajó de 66.7 ms a 33 ms. No usar `transform`/`filter` en los contenedores de las tarjetas.

