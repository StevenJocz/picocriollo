# Mercado avícola, subastas, transferencia y notificaciones — diseño

Fecha: 2026-10-14. Estado: aprobado por secciones en conversación (secciones 1 a 4); sección 5 y este documento aprobados por instrucción de continuar sin más preguntas.

## 1. Objetivo y supuestos

Ampliar Pico Criollo (Next.js 16 App Router, React 19, TypeScript estricto, `pg`) con: mercado público, subastas, operaciones comerciales, transferencia de propiedad de aves, notificaciones, reputación y moderación. No se reescribe lo existente ni se duplican módulos.

- **Hoy todo se guarda local; mañana PostgreSQL** cambiando `STORAGE_DRIVER`. Pantallas y reglas de negocio no cambian.
- En modo local "multiusuario" significa varias cuentas contra el mismo servidor de desarrollo con un archivo compartido. La UI lo indica ("Modo local").
- Los módulos nuevos son colecciones transaccionales con índices y únicos sobre campos clave (en PostgreSQL, tablas `(id, data jsonb)` generadas desde una especificación; no una columna por campo: desviación aceptada para mantener un único contrato entre drivers). La granja existente sigue siendo un documento JSONB por usuario.
- Pagos y canales externos (correo, push, navegador) son interfaces. Sin credenciales aparecen como "No configurado".

## 2. Diagnóstico del código existente

- Auth propia (`src/server/auth.ts`): scrypt, sesiones con hash, cookie HttpOnly, chequeo de origen.
- `FarmService` con `RemoteFarmService` (API + PostgreSQL) y `LocalDemoFarmService` (localStorage, solo con `NODE_ENV=development` y `NEXT_PUBLIC_LOCAL_DEMO=true`).
- Granja = un documento JSONB por usuario con versión optimista (`farm_data`). Sin datos entre usuarios.
- Ya existen aves, anillos, eventos, trazabilidad, ventas, inventario, mantenimiento, incubaciones. Se reutilizan.
- No hay jobs ni scheduler. La campana solo navega a Mantenimiento.
- `AGENTS.md` está desactualizado respecto del uso de PostgreSQL; se corrige.

## 3. Arquitectura de almacenamiento

```text
Pantalla → /api/* (delgado) → servicios de dominio → Store → driver file | driver postgres
```

- `Store.tx(fn)` ejecuta cada cambio de negocio en una transacción con colecciones tipadas.
- Driver `file`: JSON en `.data/` (ignorado por git), mutex en proceso, copia de trabajo y escritura atómica (temporal + rename). La transacción solo confirma si termina bien. Se rechaza con `NODE_ENV=production`.
- Driver `postgres`: `BEGIN/COMMIT`, `SELECT … FOR UPDATE`, índices únicos parciales. Migraciones en `database/migrations/`.
- Una prueba de contrato corre contra ambos drivers. La del driver `postgres` se omite si no hay variables `PG*` y se reporta como omitida.
- `STORAGE_DRIVER=file|postgres`; por defecto `file` en desarrollo y error en producción si falta.
- El servidor nunca confía en datos del cliente: toma el ave de la granja del usuario autenticado.
- Límite: el driver `file` es para un solo proceso; no sirve para varias instancias.

## 4. Mercado y subastas

### Publicación

- Guarda `birdId` y un `snapshot` público inmutable construido en el servidor desde una lista de campos permitidos: nombre, anillo/código, raza, sexo, nacimiento, descripción, foto, genealogía (2 generaciones), alias de criadero opcional, salud declarada, zona de entrega en texto libre.
- Nunca incluye notas privadas, dirección, correo, teléfono, eventos sanitarios, ventas ni clientes. El contacto solo se comparte dentro de una operación aceptada y con consentimiento de ambas partes.
- Todo dato del snapshot se rotula "Declarado por el vendedor". Solo se marca como hecho de plataforma lo que la plataforma sabe.
- Fotos copiadas a un `MediaStore`; la publicación no cambia si la ficha cambia.
- Hash de los campos de la ficha usados: si cambian, la publicación pasa a `requiere revisión`; nada se modifica en silencio. Una subasta con ofertas congela sus condiciones.
- Estados: `borrador, publicada, pausada, en_operación, vendida, retirada, cancelada, rechazada, cerrada_sin_ofertas`. Los filtros de "Mis publicaciones" son consultas derivadas.
- Bloqueo de disponibilidad: máximo un bloqueo activo por ave.

### Subasta (`AuctionRules`, configurable)

- Precio inicial, incremento mínimo (mayor entre 1.000 COP y 5 %), apertura y cierre en UTC, reserva opcional y oculta, anti-sniping opcional (apagado por defecto).
- La oferta es vinculante, no se retira y no es un pago.
- El vendedor no puede ofertar. Clave de idempotencia por oferta. Historial público con alias estables.
- Empate: gana la oferta más temprana. Gana la máxima ≥ reserva; si no, termina sin comprador.
- Cierre con `closeDueAuctions(now)` idempotente, ejecutado al leer y desde `POST /api/jobs/tick` (`JOBS_SECRET`).
- Cancelar: libre sin ofertas; con ofertas solo si faltan más de 24 h, con motivo, avisando a postores y registrando auditoría.

## 5. Operación, transferencia, reputación y moderación

- Operación: `solicitud_recibida → aceptada → pago_pendiente → pago_registrado → entrega_pendiente → entrega_confirmada → completada`; `cancelada` o `disputada` desde estados no finales. Pago manual: lo declara el comprador y lo confirma el vendedor ("Confirmado por el vendedor", nunca "verificado"). `PaymentProvider` es un puerto con implementación `manual`.
- Registro de propiedad `bird_ownership` + `ownership_history`; las aves se registran en el servidor al guardar la granja; un `id` ya registrado a otro dueño se rechaza (409). `PUT /api/farm` rechaza marcar `Vendido`/`Fallecido` un ave con bloqueo y alterar aves que ya no son del usuario.
- Transferencia en una sola transacción: verifica dueño, estado y vínculo con la publicación; cambia el dueño; deja lápida `Transferido` en el vendedor (anillo retirado, sin existencia); crea el ave con el mismo `id` y `code` en el comprador con solo el historial autorizado; resuelve el anillo sin pisar (si está ocupado queda "pendiente de reasignar" y el número original se conserva en el pasaporte); pasaporte `bird_passport` con la línea de ancestros declarada; publicación `vendida`; operación `completada`; bloqueo liberado; comprobante `TRF-…` con hash; eventos al outbox. Ambas granjas suben de versión.
- Reputación: solo sobre operaciones `completada`, una valoración por parte y operación, ventana de 14 días.
- Denuncias (`reports`) sobre publicación, usuario o mensaje; roles `moderator/admin`; toda acción administrativa en `audit_log` de solo-agregar.

## 6. Eventos y notificaciones

- El servicio de negocio inserta una fila en `outbox` en la misma transacción. `processOutbox()` (tras la petición, al consultar y en `tick`) resuelve destinatarios con un registro de tipos de evento y crea `notification` con unicidad `(userId, dedupeKey)` y filas `delivery` por canal.
- Notificación: categoría, prioridad, crítica, enlace, `readAt`. Toda consulta se filtra por usuario de sesión.
- Preferencias: categorías, canales, horario de silencio, zona horaria (`America/Bogota` por defecto), anticipaciones, resumen. Las críticas no se desactivan. El silencio difiere solo canales externos.
- Canales como puertos: `inApp` siempre; `browser`, `email`, `push` solo con credenciales. Fallos del proveedor quedan en la `delivery` con reintento con retroceso y no afectan la bandeja interna.
- Recordatorios derivados (`scanReminders`): eclosión = inicio + 21 días + ajuste; mensajes distintos "eclosión próxima", "fecha estimada de eclosión" y "nacimiento confirmado" (solo con registro `Birth`); tareas, insumos, mortalidad. `dedupeKey` incluye fecha o estado. Mensajes de salud aclaran que no sustituyen al veterinario.
- Cliente: sondeo cada 45 s y al recuperar foco. Ningún endpoint recibe eventos del cliente.

## 7. Interfaz y navegación

Se integra en `AppShell` reutilizando sus componentes: Inicio, Mi gallinero, Inventario, Reproducción e incubaciones, Ventas y recibos, Mercado Avícola, Mis publicaciones, Mis compras, Mis ofertas y subastas, Notificaciones, Perfil y preferencias. Menú móvil existente. La acción "Publicar en el mercado" aparece en la ficha de cada ave propia. Catálogo de consulta público para visitantes en `/mercado`.

## 8. Pruebas obligatorias

Se cubren todas las de la especificación original: publicar ave ajena, snapshot fiel, datos privados ausentes, venta simultánea, reglas y cierre de ofertas, subasta cerrada, destinatarios correctos, sin duplicados, incubación estimada vs confirmada, transferencia sin duplicar, cancelación con liberación y auditoría, permisos en servidor, fallo de proveedor externo, app funcionando sin canales externos. Pruebas de dominio con `node --test` sobre el driver `file` en directorio temporal.

## 9. Fases

1. Fundación + Fase 1: Store, drivers, auth y granja sobre Store, mercado público, publicar ave, precio fijo, interesados, notificaciones internas.
2. Solicitudes de compra, ofertas, subastas, historial, notificaciones comerciales.
3. Pago manual y entrega, transferencia, pasaporte, comprobantes.
4. Notificaciones de incubación, salud, tareas, inventario.
5. Navegador, correo y push (puertos; activos solo con proveedor).
6. Reputación, moderación, denuncias, antifraude, informes.

Orden mantenido; la Fundación se adelanta porque todas las fases dependen del `Store` y del outbox.

## 10. Honestidad sobre el alcance

Estado al cierre de la implementación: ver `docs/mercado-y-notificaciones.md` (tabla «Qué es real y qué no»). El driver `postgres` y los proveedores SMTP/Web Push no se probaron contra servicios reales. Mientras el driver sea `file`: persistencia real pero de un solo proceso, sin pasarela de pagos. No se afirma plataforma comercial multiusuario lista para producción hasta probar el driver `postgres` contra una base real.
