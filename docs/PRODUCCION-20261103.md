# Publicación .NET + Expo — 3 de noviembre de 2026

Servidor: `192.168.0.10`. Directorio de esta versión:
`/docker/pico-criollo/releases/20261103`.

## Configuración

- Web: `https://app.stereoface.online` → Nginx Proxy Manager → `pico-criollo-web:8080`.
- API: `https://api.stereoface.online` → Nginx Proxy Manager → `pico-criollo-api:8080`.
- Ambos dominios llegan por el túnel Cloudflare existente. Los servicios usan la red Docker `backend`, sin puertos publicados al host.
- PostgreSQL: `postgres:5432`, base `bdpicocriollo`.
- Secretos solo en `.env.api` del servidor, permisos `600`. La contraseña PostgreSQL procede del contenedor existente y la clave JWT se generó para esta instalación.
- La URL pública de la API se incrusta en la web durante el build; cambiarla requiere reconstruir la web.

## Operación

```bash
cd /docker/pico-criollo/releases/20261103
docker compose -f docker-compose.nueva.yml --env-file .env.api ps
docker compose -f docker-compose.nueva.yml --env-file .env.api logs --tail=100
curl -fsS https://api.stereoface.online/api/health
curl -fsS https://app.stereoface.online/salud
```

Para reconstruir después de subir cambios a este directorio:

```bash
docker compose -f docker-compose.nueva.yml --env-file .env.api build
docker compose -f docker-compose.nueva.yml --env-file .env.api up -d
```

No sobrescribir `.env.api` con archivos de desarrollo.

## Respaldo y pruebas

Publicación completada: ambos contenedores saludables. HTTPS mediante Cloudflare verificado con respuesta 200 en `/api/health` y `/salud`; preflight CORS desde la web devuelve 204 y el origen correcto. La granja sin token devuelve 401. Bienvenida e ingreso comprobados en el navegador durante la publicación. Los 10 pasos del script de humo pasaron contra la copia PostgreSQL, incluyendo registro, login, renovación de sesión, aves, compras, subasta, social, notificaciones, huevos e insumos.

- Respaldo previo: `/docker/pico-criollo/backups/bdpicocriollo-20261103.dump`.
- Base aislada de pruebas: `bdpicocriollo_release_20261103`, restaurada desde ese respaldo.
- El script `scripts/humo-api.py` crea cuentas y registros; ejecutarlo únicamente contra la API temporal conectada a esa copia, no contra producción.
- Respaldo de la ruta web anterior: `/opt/nginx-proxy-manager/data/pico-host3-before-20261103.json`.
- Antes del cambio, el proxy host 3 apuntaba a `antopia:80`. Ese contenedor se conserva. En Nginx Proxy Manager se puede restaurar ese destino para volver al sitio anterior; esto no revierte datos de PostgreSQL.

## Pendiente de configuración

SMTP no tiene credenciales configuradas: el envío de correos de recuperación no queda habilitado por esta publicación. El registro y el ingreso se verifican por separado.

La migración funcional general sigue documentada en `CORTE.md`; publicar esta versión no significa que todos los módulos pendientes estén migrados.

## Revisión posterior

### Incidente de registro y recuperación

El registro en producción devolvió 500 por timeout de PostgreSQL al consultar `app_users.profile`. Se observaron procesos antiguos consumiendo CPU, sin bloqueos SQL declarados; una muestra con `perf` los situó en `shmem_get_folio_gfp` durante la actualización de estadísticas. La cancelación y terminación normal de la sesión no funcionaron. No se confirmó la causa definitiva del bloqueo del sistema.

Con autorización del usuario se intentó reiniciar PostgreSQL; Docker no logró detener sus procesos. Se autorizó y ejecutó el reinicio completo del servidor. El arranque pasó del kernel `7.0.0-38` al `7.0.0-42` ya instalado. PostgreSQL quedó detenido y se inició explícitamente, seguido del reinicio de la API. No se reinstaló PostgreSQL ni se restauraron o eliminaron bases.

Verificación posterior directamente en producción a través de Cloudflare: registro 200 (1,93 s), login 200 (1,28 s), granja privada 200 (0,51 s), renovación de sesión 200 (0,49 s). La cuenta temporal se eliminó por su UUID y correo exactos al finalizar. Esto confirma recuperación del servicio, no que el bloqueo no pueda repetirse.

Se repitieron los 10 pasos funcionales con éxito después de unas seis horas de funcionamiento. Registro, login y operaciones que escriben datos se probaron en `bdpicocriollo_release_20261103`, sin introducir cuentas de prueba en producción. Registro del servidor: `/docker/pico-criollo/prueba-revision-20261103.log`.

En los dominios públicos se verificaron PostgreSQL conectado, salud web, HTML de bienvenida/ingreso/registro/reels/mercado, descarga de los tres scripts de entrada, CORS y rechazo 401 al solicitar la granja sin token. Estas comprobaciones HTTP no equivalen a una revisión visual de cada pantalla. La automatización del navegador integrado no estuvo disponible en esta segunda ronda. El contenedor temporal se detuvo al finalizar.
