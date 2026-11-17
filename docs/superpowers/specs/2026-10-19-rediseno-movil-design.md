# Rediseño móvil-primero de Pico Criollo

## Intención
Que la app se sienta como una aplicación móvil moderna, cálida y fácil de usar, con el lenguaje visual de la referencia que dio el usuario (tres pantallas de cuidado de plantas): fondos con degradado verde suave, tarjetas de vidrio esmerilado, esquinas muy redondeadas, titulares grandes con una palabra en verde, buscador en píldora, accesos rápidos en fichas cuadradas y una barra inferior flotante donde la pestaña activa se expande. Las mismas funciones de hoy; cambia la forma, no el contenido ni las reglas.

## Objetivos
- Se usa bien con el pulgar en un teléfono de 360–430 px: textos de 15–16 px, objetivos táctiles de al menos 44 px, nada de letra de 8–10 px.
- Navegación móvil con barra inferior flotante (Inicio, Aves, Mercado, Avisos, Más). «Más» abre el menú completo actual.
- Inicio en móvil: saludo con el nombre, buscador, tarjeta principal con la acción del día, cuatro accesos rápidos y tarjetas de resumen.
- Pantalla de entrada (iniciar sesión/crear cuenta) con la misma estética, a pantalla completa.
- Diálogos como hojas inferiores en móvil; ventanas de chat a pantalla completa en móvil.
- En escritorio se conserva la barra lateral, pero con el mismo lenguaje visual.

## No objetivos / antiobjetivos
- No se cambia ninguna regla, API, ruta ni modelo de datos.
- No se introducen librerías nuevas ni imágenes externas; todo es CSS y SVG propio.
- No se rompe el escritorio ni la accesibilidad (foco visible, contraste, `prefers-reduced-motion`).

## Decisiones propias (mi criterio, no acordadas)
- Capa de tema única `src/app/theme.css`, cargada al final y con especificidad `body …`, en lugar de reescribir ~100 KB de CSS existente: reversible borrando el archivo y su import.
- Tipografías ya en uso: Manrope (titulares) y DM Sans (texto).
- Barra inferior: Inicio · Mis aves · Mercado · Avisos (con contador) · Más. Se muestra solo por debajo de 900 px.
- El buscador de trazabilidad pasa del encabezado al Inicio en móvil.
- Paleta: verde bosque profundo para texto y botones, menta suave para fondos, dorado cálido como acento puntual.

## Verificación
Capturas en 390×844 y 1280×800 de entrada, inicio, aves, mercado, publicar, perfil y chat; `npm run lint`, `typecheck`, `build` y la suite de pruebas sin cambios en resultado.
