#!/usr/bin/env bash
# Publica Pico Criollo en el servidor. Se ejecuta EN el servidor, dentro de /docker/pico-criollo.
# Hace respaldo de la base, construye, levanta y comprueba la salud. No borra contenedores ni volúmenes.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  # Primera vez: toma la clave del contenedor postgres (no se imprime) y genera JOBS_SECRET.
  PG_PASSWORD="$(docker exec "${PG_CONTAINER:-postgres}" printenv POSTGRES_PASSWORD 2>/dev/null || true)"
  if [[ -z "$PG_PASSWORD" ]]; then
    echo "No pude leer POSTGRES_PASSWORD del contenedor. Crea .env.production a mano (ver .env.production.example)." >&2
    exit 1
  fi
  (
    umask 077
    {
      echo "PGHOST=postgres"
      echo "PGPORT=5432"
      echo "PGDATABASE=bdpicocriollo"
      echo "PGUSER=postgres"
      echo "PGPASSWORD=${PG_PASSWORD}"
      echo "DATABASE_SSL=false"
      echo "APP_ORIGIN=${APP_ORIGIN:-https://app.stereoface.online}"
      echo "STORAGE_DRIVER=postgres"
      echo "JOBS_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    } > .env.production
  )
  echo ".env.production creado."
fi
for var in PGPASSWORD JOBS_SECRET STORAGE_DRIVER; do
  if ! grep -Eq "^${var}=.+" .env.production || grep -Eq "^${var}=CAMBIAR" .env.production; then
    echo "Completa ${var} en .env.production." >&2
    exit 1
  fi
done
chmod 600 .env.production

if ! docker network inspect backend >/dev/null 2>&1; then
  echo "No existe la red Docker 'backend'. Créala o conecta primero postgres a ella." >&2
  exit 1
fi

PG_CONTAINER="${PG_CONTAINER:-postgres}"
PG_DB="$(grep -E '^PGDATABASE=' .env.production | cut -d= -f2-)"
PG_USER="$(grep -E '^PGUSER=' .env.production | cut -d= -f2-)"
BACKUP="/root/${PG_DB}-$(date +%Y%m%d-%H%M%S).dump"
echo "Respaldo de ${PG_DB} en ${BACKUP}"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$BACKUP"
chmod 600 "$BACKUP"

# Si el nombre pico-criollo lo usa una versión vieja, se renombra (no se borra) para poder volver atrás.
if docker ps -a --format '{{.Names}}' | grep -qx pico-criollo; then
  if [[ -z "$(docker compose ps -q pico-criollo 2>/dev/null)" ]]; then
    docker stop pico-criollo >/dev/null
    docker rename pico-criollo "pico-criollo-anterior-$(date +%Y%m%d%H%M%S)"
  fi
fi

docker compose up -d --build
echo "Esperando salud…"
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' pico-criollo 2>/dev/null || true)"
  [[ "$state" == "healthy" ]] && break
  sleep 5
done
docker compose ps
docker exec pico-criollo node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status, await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
echo "Listo. Falta apuntar el proxy a http://pico-criollo:3000 (ver docs/nginx-pico-criollo.conf)."
