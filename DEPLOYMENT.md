# Publicar Pico Criollo en el servidor

Esta guía publica el proyecto Next.js actual en el Ubuntu que ya tiene Docker, PostgreSQL y Cloudflare Tunnel. No requiere abrir PostgreSQL ni el puerto 3000 a Internet. Ejecútala desde una sesión SSH iniciada por ti.

## Qué hace y qué conserva

- La aplicación nueva usa el PostgreSQL existente (`postgres:5432`, base `bdpicocriollo`, usuario `postgres`) y crea sus tablas propias (`app_users`, `app_sessions`, `farm_data`). No borra tablas antiguas.
- Cada cuenta nueva empieza con gallineros vacíos. **Los registros del sistema anterior no se importan automáticamente.** Conserva los contenedores antiguos y haz respaldo hasta verificar la aplicación nueva y decidir cómo migrar esos datos.
- No ejecutes `docker compose down -v`, `docker volume prune`, `docker system prune` ni borres el contenedor `postgres`.
- El archivo `.env.production` contiene credenciales y debe permanecer solo en el servidor, con permisos `600`.

## 1. Copiar el proyecto al servidor

Desde WinSCP, copia el contenido de esta carpeta de Windows:

```text
C:\Users\Usuario\Documents\ChatGPT\Pico criollo\pico-criollo
```

a `/docker/pico-criollo` en el servidor. No copies `.env`, `.env.production` ni claves privadas. La plantilla `.env.production.example` no contiene secretos.

Abre PuTTY y confirma que estás en el servidor: el prompt debe parecerse a `root@...:~#`, no a `PS C:\...>`.

## 2. Identificar el contenedor API antiguo y crear el entorno privado

Lista nombres e imágenes sin mostrar variables secretas:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Escoge el nombre del contenedor API antiguo (preferiblemente el contenedor, no solo la imagen), entra al proyecto y ejecuta el importador. Sustituye `NOMBRE_API_ANTIGUA` por ese nombre:

```bash
cd /docker/pico-criollo
bash scripts/import-db-env.sh NOMBRE_API_ANTIGUA
```

El importador lee variables comunes de PostgreSQL o una `DATABASE_URL`, escribe `.env.production` con permisos `600` y no imprime sus valores. Los valores conocidos de este servidor se usan como respaldo: host `postgres`, puerto `5432`, base `bdpicocriollo`, usuario `postgres` y origen `https://app.stereoface.online`.

Si el importador dice que no encontró la contraseña, el contenedor puede usar un secreto montado como archivo o tener otra configuración. No compartas esa contraseña por chat: crea el archivo directamente en el servidor con `nano .env.production`, copia el formato de `.env.production.example`, escribe el valor localmente y guarda con **Ctrl+O**, **Enter**, **Ctrl+X**. Luego ejecuta:

```bash
chmod 600 .env.production
```

## 3. Revisar la red y hacer un respaldo

Verifica que la red `backend` ya existe y conecta PostgreSQL:

```bash
docker network inspect backend
docker inspect --format '{{json .NetworkSettings.Networks}}' postgres
```

La red debe incluir `postgres`. Si el contenedor se llama de otra forma, usa ese nombre en el segundo comando. No crees otra red `backend` si ya existe.

Haz un respaldo de la base antes de publicar. Este comando guarda el archivo en `/root` y no muestra su contenido:

```bash
docker exec postgres pg_dump -U postgres -d bdpicocriollo -Fc > /root/bdpicocriollo-antes-pico-criollo.dump
chmod 600 /root/bdpicocriollo-antes-pico-criollo.dump
```

Si `pg_dump` falla porque el nombre del contenedor o el acceso local son diferentes, detente y corrige el respaldo antes de limpiar contenedores antiguos.

## 4. Crear la aplicación

Comprueba si ya hay un contenedor llamado `pico-criollo`:

```bash
docker ps -a --filter name=^/pico-criollo$ --format '{{.Names}} {{.Image}} {{.Status}}'
```

Si ese nombre ya pertenece a la versión antigua, **no lo borres todavía**. Renómbralo para liberar el nombre, conservándolo disponible para volver atrás:

```bash
docker stop pico-criollo
docker rename pico-criollo pico-criollo-anterior
```

Luego construye y levanta la nueva aplicación:

```bash
cd /docker/pico-criollo
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 pico-criollo
```

El servicio solo se expone en la red Docker `backend`. No hay `ports:` para 3000 y PostgreSQL no se publica.

Comprueba la salud:

```bash
docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' pico-criollo
docker exec pico-criollo node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status, await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

Una respuesta sana muestra `200` y estado conectado a PostgreSQL. Después abre la URL pública y crea tu cuenta. El registro inicial crea las tablas necesarias si todavía no existen.

## 5. Reparar Cloudflare Tunnel (Error 1033)

El **1033 indica que Cloudflare no ve un conector `cloudflared` saludable**; no es un error de contraseña de la aplicación. Primero mira el estado en Cloudflare Zero Trust → **Networks / Tunnels** (la etiqueta puede variar) y en el servidor:

```bash
docker ps -a --filter name=cloudflared --format '{{.Names}} {{.Image}} {{.Status}}'
docker logs --tail=100 cloudflared
```

No pegues registros sin revisarlos: podrían incluir identificadores de tu túnel. Si el contenedor está detenido y conserva su configuración actual, reinícialo sin recrearlo:

```bash
docker start cloudflared
docker logs --tail=50 cloudflared
```

Espera a que el túnel figure como **Healthy** en el panel de Cloudflare. Si está `Down` o `Inactive`, sigue la opción **Add a replica** del túnel existente para reconstruir su conector; no crees un túnel nuevo ni reemplaces el token a ciegas. Mantén el token secreto.

Cuando el conector esté saludable, asegúrate de que también esté en la red `backend`:

```bash
docker inspect --format '{{json .NetworkSettings.Networks}}' cloudflared
```

Si `backend` no aparece y el contenedor se llama `cloudflared`, conéctalo:

```bash
docker network connect backend cloudflared
```

En el túnel existente, configura el hostname público `app.stereoface.online` para el servicio:

```text
http://pico-criollo:3000
```

El nombre del host debe resolver desde la red `backend`. Conserva el túnel y sus credenciales existentes. No abras el puerto 3000 ni cambies los DNS a una IP del hogar. Cloudflare explica que 1033 significa que no encuentra un conector saludable: [documentación oficial de Error 1033](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1033/).

Si el túnel aparece `Healthy` pero la app no carga, revisa `docker compose logs --tail=100 pico-criollo` y confirma que el servicio publicado sea `http://pico-criollo:3000`; un fallo entre el túnel y el origen suele mostrarse como 502, no 1033.

## 6. Retirar los contenedores anteriores (solo después de verificar)

Después de comprobar login, `/api/health`, creación de registros y el dominio, identifica otra vez los nombres exactos:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Detén y elimina **solo** los antiguos contenedores web/API de Pico Criollo que ya no necesites. No incluyas `postgres`, `cloudflared`, `nginx-proxy-manager`, `nginx-proxy-manager-db`, `pgadmin` ni `postgres-backup`. No añadas `-v`; así no borras volúmenes. Conserva el contenedor renombrado hasta que confirmes el nuevo sistema y tengas respaldo.

La aplicación nueva guarda datos en las tablas nuevas por usuario. Los registros históricos de la API anterior seguirán en sus tablas anteriores y requieren una migración separada si deseas verlos en la nueva aplicación.

## 7. Activar el Mercado Avícola y las notificaciones en producción

La versión con mercado, subastas, transferencias y notificaciones guarda en el almacenamiento elegido por `STORAGE_DRIVER`. En desarrollo se usa `file` (archivo local `.data/`); **en producción el archivo se rechaza** y se exige `postgres`.

> **Advertencia honesta:** el driver `postgres` está escrito y revisado, pero esta entrega **no lo probó contra un servidor PostgreSQL real** (no había uno disponible). Antes de usarlo con datos reales, pruébalo en una base de pruebas (paso 7.1).

### 7.1 Probar el driver `postgres` en una base de pruebas

Crea una base vacía distinta de la de producción y ejecuta la prueba de contrato (es la misma suite que valida el driver de archivo):

```bash
TEST_PGDATABASE=bdpicocriollo_pruebas PGHOST=localhost PGUSER=postgres PGPASSWORD='...' npm test
```

Sin `TEST_PGDATABASE` esas pruebas se reportan como **omitidas**, no como aprobadas. Revisa también `database/migrations/002_market.sql`: es el DDL completo (se genera con `npm run db:migration` y una prueba comprueba que no se desactualice). El driver lo aplica solo al primer uso con `CREATE TABLE IF NOT EXISTS`; no modifica ni borra tablas existentes (solo añade la columna `app_users.profile`).

### 7.2 Variables de entorno

Añade a `.env.production` (ver `.env.production.example`):

```text
STORAGE_DRIVER=postgres
JOBS_SECRET=<cadena larga aleatoria>
```

### 7.3 Trabajos programados

El cierre de subastas, los recordatorios (eclosión, tareas, inventario) y los reintentos de envío se ejecutan también de forma perezosa al consultar la app, pero conviene un cron que llame cada 5 minutos a un endpoint protegido por secreto:

```bash
curl -fsS -X POST -H "x-jobs-secret: $JOBS_SECRET" http://pico-criollo:3000/api/jobs/tick
```

Sin `JOBS_SECRET` el endpoint responde 503 y queda deshabilitado.

### 7.4 Canales externos (opcionales)

Solo aparecen como disponibles en «Perfil y preferencias» cuando existen sus credenciales. Sin ellas la app funciona con la bandeja interna.

- **Correo:** `SMTP_HOST`, `SMTP_FROM` y, si aplica, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- **Avisos del navegador (Web Push):** genera claves con `npx web-push generate-vapid-keys` y define `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (por ejemplo `mailto:contacto@tudominio.com`). Requiere HTTPS. El navegador pide permiso solo cuando la persona pulsa el botón de activación.
- **Push móvil:** el puerto existe, pero no hay proveedor implementado.

### 7.4.1 Restablecer la contraseña

«¿Olvidaste tu contraseña?» envía un enlace de un solo uso (vale 30 minutos; solo se guarda su hash en `pc_password_resets`) a `/restablecer?token=…`. Al usarlo se cierran todas las sesiones de la cuenta.

- Necesita **correo** (7.4) y `APP_ORIGIN` (el dominio del enlace sale solo de ahí, nunca de la petición). Sin `APP_ORIGIN` en producción no se envía nada.
- Sin SMTP la app no puede escribirle a la persona: el enlace queda en el registro del servidor (`docker logs pico-criollo | grep restablecer`) y quien administra se lo puede pasar. Es un respaldo, no la solución para producción.
- La tabla nueva se crea sola al arrancar; no hace falta migrar.

### 7.5 Moderadores

No hay pantalla para asignar roles. Para crear un moderador, con la app detenida o en una ventana de mantenimiento:

```sql
UPDATE app_users SET profile = profile || '{"role":"moderator"}'::jsonb WHERE email = 'persona@correo.com';
```

(`"admin"` también puede moderar.) En modo archivo, edita el campo `role` del usuario en `.data/pico.json` con la aplicación detenida.

### 7.6 Qué no hace todavía

No hay pasarela de pagos: los pagos son declarados por el comprador y confirmados por el vendedor, y la interfaz lo dice así. No hay factura electrónica DIAN. El comprobante de transferencia es un documento interno con huella SHA-256.

## 8. Perfiles y publicaciones de demostración

Cuando una persona con sesión abre Inicio o el Mercado, la aplicación crea de forma idempotente tres perfiles y publicaciones marcadas **MUESTRA**. También muestra anuncios ilustrativos, desactivados para compra. No tienen inicio de sesión, no aceptan seguimientos, comentarios ni “me gusta”, y no crean existencias, ventas, compras, pagos ni opiniones reales.

Al registrarse la cuenta real número 20, la aplicación retira estos perfiles y sus relaciones/publicaciones de muestra. Las cuentas reales y los datos de granja existentes no se eliminan. Las imágenes son recursos incluidos en `public/fotos/`.

## 9. La pila nueva (API .NET + app Expo web), junto a Next.js

> **Todavía no reemplaza a Next.js.** Faltan moderación, lotes de pollitos/huevos/insumos en el mercado, fotos y videos propios y los canales de correo y navegador. El estado, el orden y la marcha atrás están en [`docs/CORTE.md`](docs/CORTE.md). Esta sección solo levanta la pila nueva **al lado** de la vieja; no apaga nada.

Comparte la base de datos de la sección 2. Agrega tablas `api_*` (sesiones de refresco, restablecimientos, dispositivos push) con `CREATE … IF NOT EXISTS`; no modifica ni borra las demás. **Nunca se ha probado contra un PostgreSQL real ni se han construido las imágenes**: haz primero el respaldo (§3) y la prueba contra una copia de la base (`docs/CORTE.md`, sección 3).

### 9.1 Variables
```bash
cd /docker/pico-criollo
cp .env.api.example .env.api
chmod 600 .env.api
nano .env.api      # PGPASSWORD, JWT_KEY (openssl rand -base64 48), APP_ORIGEN y API_URL_PUBLICA
```
`API_URL_PUBLICA` se incrusta en la app web al construirla: si cambia hay que reconstruir `pico-criollo-web`. `PGPOOL` suma conexiones a las de Next.js: revisa `max_connections` de PostgreSQL.

### 9.2 Construir y levantar
```bash
docker compose -f docker-compose.nueva.yml --env-file .env.api build
docker compose -f docker-compose.nueva.yml --env-file .env.api up -d
docker compose -f docker-compose.nueva.yml ps
docker compose -f docker-compose.nueva.yml logs --tail=100 pico-criollo-api
```
No hay `ports:` publicados; los dos contenedores solo se ven en la red `backend`. No uses `down -v`.

### 9.3 Enrutar
Publica dos hostnames nuevos en el túnel de Cloudflare o en Nginx Proxy Manager, sin tocar el dominio actual:

```text
api.TU-DOMINIO  ->  http://pico-criollo-api:8080
app2.TU-DOMINIO ->  http://pico-criollo-web:8080
```
El origen de `app2.…` debe ser el mismo `APP_ORIGEN` del `.env.api` (la API solo acepta llamadas de ese origen).

### 9.4 Comprobar
```bash
docker exec pico-criollo-web wget -qO- http://127.0.0.1:8080/salud
python scripts/humo-api.py https://api.TU-DOMINIO
```
`humo-api.py` crea dos cuentas de prueba (`humo-…@correo.test`) y algunos registros, y no los borra; límpialos después con tu criterio. Swagger no se publica salvo `OPENAPI_PUBLICAR=true`.

### 9.5 Retirar la pila nueva
```bash
docker compose -f docker-compose.nueva.yml stop
```
Next.js no se ve afectado. Las tablas `api_*` se pueden dejar.
