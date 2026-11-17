# Pico Criollo: sistema visual

Dirección y límites en `PRODUCT.md`. Las capas viven en `src/app/`: `theme.css` (base móvil-primero) y `modern.css` (paleta y movimiento actuales; se puede quitar sola).

## Color
| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#0d1f16` | texto principal |
| `--muted` | `#566b5f` | texto secundario (≥ 4.5:1 sobre el fondo) |
| `--green` / `--green-dark` | `#2c8c58` / `#123a25` | única acción y énfasis |
| `--mint` `--sky` `--lilac` `--peach` | `#bfeed6` `#bfe0f6` `#d8cffa` `#fde2d2` | solo fondos y superficies, nunca texto |
| cristal | `rgba(255,255,255,.66)` y `.92` | tarjetas y barras, siempre sobre el fondo pastel |

Texto secundario sobre superficies de color: se tiñe del mismo tono, no de gris.

## Forma y profundidad
Esquinas 16 / 24 / 32 px. Sombras con desplazamiento y desenfoque (`--shadow`, `--shadow-lift`); nunca halos sin desplazamiento ni sombras duras.

## Tipografía
Manrope para títulos (peso 800, `text-wrap: balance`), DM Sans para texto. Cifras tabulares en todo dato que cambie (métricas, reloj, inventario). Sin etiquetas pequeñas sobre los títulos: el título lleva el peso.

## Movimiento
- Curvas: `--ease-out` `cubic-bezier(.23,1,.32,1)` para entradas y respuestas; `--ease-in-out` para lo que se mueve en pantalla; `--ease-drawer` para hojas y la barra inferior. Nunca `ease-in` ni rebotes.
- Tiempos: pulsar 160 ms; cambios de estado ≤ 200 ms; entrada de tarjetas 280 ms con 30 ms de escalón (máximo 4 escalones); la secuencia de bienvenida, hasta 640 ms una sola vez.
- Todo lo pulsable baja a `scale(.97)` al presionar. El pase del cursor solo cambia la sombra y solo con puntero fino (`(hover: hover) and (pointer: fine)`).
- El único movimiento ambiental es el fondo pastel. No hay bucles decorativos en tarjetas, banners ni textos.
- Movimiento reducido: fundidos de 200 ms, sin desplazamientos.
- Se anima con `transform` y `opacity`; nada con `transition: all`.

## Piezas del inicio
Buscador, tarjeta principal, tira de categorías deslizable, banner de cuenta regresiva (solo con una incubación en curso), tarjetas de datos y barra inferior flotante.
