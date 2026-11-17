# Corte: de la app Next.js a la API .NET + app Expo

Actualización de despliegue (2026-11-03): las dos imágenes Docker se construyeron en el servidor. Los 10 pasos de `scripts/humo-api.py` pasaron contra una copia de PostgreSQL real: registro, sesión, granja, mercado de aves, subastas, social, notificaciones y compraventa de huevos e insumos con reservas y transferencia. Esto sustituye las menciones históricas de «nada probado en PostgreSQL» y «imágenes no construidas» de abajo; no verifica concurrencia entre procesos, paridad completa ni todos los módulos. Operación y respaldos en `PRODUCCION-20261103.md`.

Estado al 2026-10-30: **la pila nueva todavía no tiene paridad completa**. Este documento dice qué falta, qué hay que comprobar y en qué orden apagar Next.js. **No apagues ni borres la app Next.js hasta cumplir la lista de la sección 4 y tener tu visto bueno.**

Las dos pilas comparten la misma base de datos (`bdpicocriollo`) y conviven sin pisarse: la nueva solo agrega tablas con prefijo `api_` y crea con `CREATE … IF NOT EXISTS` las que falten. Mientras convivan, un criador puede entrar por cualquiera de las dos con la misma cuenta (mismo formato scrypt) y ve la misma granja, mercado y perfil.

## 1. Matriz de paridad

| Módulo | Next.js | Pila nueva | Nota |
|---|---|---|---|
| Registro, ingreso, recuperar contraseña | Sí | **Sí** | Sesión con JWT + refresco rotativo. Las sesiones de una pila no valen en la otra: cada persona vuelve a entrar una vez |
| Gallineros, aves, recolección, incubación, compras, inventario, agenda | Sí | **Sí** | Reglas en el servidor, con control de versión del documento |
| Nacimientos, grupos reproductores, anillos, eventos del ave | Sí | **Sí** | Fase 6 |
| Lotes de huevos fértiles (crear, dividir, fertilidad) | Sí | **Sí** | Fase 6 |
| Clientes, catálogo, ventas, abonos, devoluciones, cancelación, recibo | Sí | **Sí** | Fase 6. Probado en el navegador contra la API |
| Trazabilidad y reporte comercial | Sí | **Sí** | Mismas fórmulas que `traceability.ts` (ver «diferencias heredadas») |
| Mercado: aves y lotes de aves, subastas, compraventa, traspaso, factura, mensajes | Sí | **Sí** | |
| Mercado: **lotes de pollitos** (publicar y transferir) | Sí | **Sí, pendiente prueba PostgreSQL** | Expo permite seleccionar lote y cantidad; API reserva existencias y transfiere al comprador |
| Mercado: **huevos e insumos** (publicar y transferir) | Sí | **Sí, pendiente prueba PostgreSQL** | Selección y cantidades en Expo; reservas, compra y recepción en API; huevos pasan a un lote nuevo e insumos se suman al catálogo por nombre/unidad |
| Mercado: **fotos propias** de la publicación | Sí | **Parcial** | La foto propia del ave se sube desde Expo y se muestra en su publicación si está permitida; faltan fotos independientes del anuncio |
| Perfil social, muro, me gusta, comentarios, compartir, reels | Sí | **Sí** | |
| **Videos propios** (subir y comprimir con ffmpeg) | Sí | **No** | Solo enlaces de YouTube |
| Notificaciones (bandeja, preferencias, recordatorios) y push de Expo | Sí | **Sí** | Push sin probar en teléfono |
| **Correo y navegador (Web Push) como canales**, resumen diario/semanal | Sí | **No** | |
| **Moderación**: denuncias, resolución de disputas, roles de moderador, suspensiones | Sí | **Sí, pendiente prueba PostgreSQL** | API de denuncias, auto pausa, decisiones, auditoría y bandeja de Expo; pruebas de permisos y estado en memoria |
| **Perfiles y comunidad de muestra** (demostración) | Sí | **No** | |
| Identificación por anillo con cámara / OCR, árbol genealógico | Parcial | **Parcial** | Árbol con abuelos, padres, hermanos, hijos y descendientes en Expo; cámara/OCR del anillo pendiente |
| Eventos derivados de cambios en la granja (nacimiento, baja, variación de existencias) | Sí | **Sí** | Se emiten al guardar |
| Tareas programadas (`/api/jobs/tick`) | Sí | **Sí, distinto** | Servicios internos: cierre de subastas cada minuto, notificaciones cada 15 s, recordatorios cada hora |
| SEO de reels y mercado públicos | Sí (servidor) | **No** | Expo web no renderiza en servidor |

### Diferencias heredadas (no son errores del port)
- En una devolución, `refunded` se calcula como `min(valor devuelto, pagado − reembolsado)` aunque la venta no esté sobrepagada (`traceability.ts`). El detalle de la venta muestra «Saldo por cobrar $0» mientras el reporte muestra el mismo valor como por cobrar. Idéntico en Next.js; se corrige en una pasada aparte, en las dos pilas a la vez.
- El rastro de un lote muestra su origen (ancestros), no las ventas que salieron de él; se busca la venta por su código para ver la cadena completa.

El diseño Expo ahora comparte cabecera de criador y menú flotante en todas las pantallas autenticadas: Inicio abre reels, Mi granja abre el dashboard, Mercado y Perfil tienen accesos propios. El menú no aparece en el ingreso ni el registro. La foto registrada del ave se usa en su ficha, árbol y ficha de mercado. Se comprobó compilación y exportación web, 132 pruebas API y 39 pruebas Expo; falta revisión visual en dispositivo y prueba de API con PostgreSQL real.

## 2. Lo que no se ha probado
Avance de huevos e insumos (2026-10-30): 7 pruebas específicas de API y las 2 de pollitos aprobadas en memoria; 8 pruebas del formulario de mercado y TypeScript aprobados. Compra completa por HTTP verificada en local: recepción de 6 huevos en lote nuevo y 5 kg de maíz acumulados en el catálogo del comprador. Se probaron rechazo por falta de existencias y ausencia de comprobantes cuando no se puede transferir. PostgreSQL real y concurrencia entre procesos siguen pendientes.

Avance del módulo de lotes de pollitos: dos pruebas específicas de API pasan en memoria (reserva, rechazo por existencias insuficientes, liberación y recepción con transferencia). La publicación incrementa la versión de la granja para detectar escrituras concurrentes; falta comprobar la concurrencia contra PostgreSQL real. El contrato OpenAPI y el cliente Expo incluyen `lotId` y `quantity`.

- **Nada contra un PostgreSQL real.** Las 132 pruebas de la API usan una base en memoria. Las partes más expuestas: listas por `data->>'campo'`, `FOR UPDATE`, índices únicos y la convivencia de escritura con Next.js sobre `farm_data`.
- **Las imágenes Docker** (`api/Dockerfile`, `mobile/Dockerfile`) no se han construido: esta máquina no tiene Docker.
- **Push en teléfono** (necesita proyecto EAS) y **iOS/Android**: solo se probó web.
- Rendimiento y carga.

`scripts/humo-api.py` hace una prueba de punta a punta (dos cuentas, granja, venta, mercado) contra una API en marcha y es la primera comprobación que se corre en el servidor. Deja las cuentas `humo-…@correo.test` creadas:

```bash
python scripts/humo-api.py http://127.0.0.1:8080
```

## 3. Orden del despliegue (sin apagar nada)
1. Respaldo de la base (`DEPLOYMENT.md` §3).
2. **Prueba contra una copia**: restaura el respaldo en `bdpicocriollo_pruebas`, apunta ahí una API temporal y corre `humo-api.py`. Revisa el registro de la API: no debe haber errores SQL.
3. Crea `.env.api` desde `.env.api.example` (permisos 600) y levanta la pila nueva junto a la vieja (`DEPLOYMENT.md` §9). La API y la web quedan en la red `backend`; Next.js sigue intacto.
4. Publica dos hostnames nuevos por el proxy (por ejemplo `api.…` y `app2.…`), sin tocar el dominio actual.
5. Camina la lista del punto 4 con cuentas reales de prueba, entrando por los dos lados.
6. Solo entonces, decide el cambio de dominio.

## 4. Lista de «sí» para apagar Next.js
- [ ] `humo-api.py` pasa contra la API en el servidor, con la base real.
- [ ] Con la misma cuenta se entra por ambas pilas y se ve la misma granja; una venta hecha en la nueva aparece en Next.js y al revés (probar también el conflicto 409 de versión).
- [ ] Se decidió, módulo por módulo, qué hacer con lo que falta (sección 1, filas «No»): construirlo antes del corte o aceptar su pérdida. **Moderación y denuncias** ya están implementadas; deben probarse con PostgreSQL real antes del corte.
- [ ] Logs de la API sin errores durante al menos una semana de uso real en paralelo.
- [ ] Tras reconstruir la web nueva, un navegador con la versión anterior baja la nueva (el HTML no se cachea; los archivos con hash sí).
- [ ] Respaldo reciente de la base y de los contenedores de Next.js (renombrar, no borrar).

## 5. Apagado y marcha atrás
**Apagado (cuando todo lo anterior esté en «sí»):**
1. Cambia el hostname del dominio público al servicio `pico-criollo-web` (y el de la API a `pico-criollo-api`).
2. Detén (no elimines) el contenedor Next.js: `docker stop pico-criollo` y `docker rename pico-criollo pico-criollo-nextjs`.
3. Deja el cron de `/api/jobs/tick` desactivado: ya no existe quien lo reciba. Los servicios internos de la API lo reemplazan.
4. Conserva el contenedor y el código de Next.js durante al menos 30 días.

**Marcha atrás (si algo falla):**
1. Vuelve el hostname del proxy a `http://pico-criollo:3000`.
2. `docker start pico-criollo-nextjs`.
3. La base no necesita deshacerse: la pila nueva solo agregó tablas `api_*` y escribió documentos con el mismo formato que Next.js. Se pierde únicamente el estado de las sesiones nuevas (cada quien vuelve a entrar) y los tokens push de los teléfonos.

**Después de 30 días sin marcha atrás:** retirar el código Next.js del repositorio, `docker-compose.yml`, `JOBS_SECRET` y el cron. Es una decisión aparte, con tu confirmación.

## 6. Riesgos que siguen abiertos
- scrypt N=16384 (por debajo del mínimo actual de 32768): subir con rehash al ingresar cuando Next.js ya no verifique contraseñas.
- Token de refresco de la web en `localStorage`: aceptable mientras no haya contenido de terceros en la página; revisar si se agrega.
- `GET /api/media/{id}` es abierto por diseño (UUID aleatorio, para que una etiqueta de imagen lo cargue).
- Sin SEO público en reels y mercado.
