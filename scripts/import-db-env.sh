#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: bash scripts/import-db-env.sh <nombre-o-id-de-contenedor-api>" >&2
  exit 2
fi

source_ref=$1
if ! docker inspect "$source_ref" >/dev/null 2>&1; then
  echo "No encuentro ese contenedor o imagen en Docker." >&2
  exit 1
fi

if [[ -e .env.production ]]; then
  echo ".env.production ya existe; no lo sobrescribo. Haz una copia y revísalo manualmente." >&2
  exit 1
fi

umask 077
raw_env=$(mktemp)
generated_env=$(mktemp)
trap 'rm -f "$raw_env" "$generated_env"' EXIT

# The inspected values stay in protected temporary files and are never printed.
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$source_ref" > "$raw_env"

python3 - "$raw_env" "$generated_env" <<'PY'
import json
import sys
from urllib.parse import unquote, urlparse, parse_qs

source, destination = sys.argv[1:]
env = {}
with open(source, encoding="utf-8") as handle:
    for line in handle:
        key, sep, value = line.rstrip("\n").partition("=")
        if sep:
            env[key] = value

def first(*names):
    for name in names:
        value = env.get(name)
        if value:
            return value
    return None

host = first("PGHOST", "DB_HOST", "POSTGRES_HOST", "POSTGRESQL_HOST", "DATABASE_HOST")
port = first("PGPORT", "DB_PORT", "POSTGRES_PORT", "POSTGRESQL_PORT", "DATABASE_PORT")
database = first("PGDATABASE", "POSTGRES_DB", "POSTGRES_DATABASE", "DB_NAME", "DATABASE_NAME")
user = first("PGUSER", "POSTGRES_USER", "POSTGRESQL_USER", "DB_USER", "DATABASE_USER")
password = first("PGPASSWORD", "POSTGRES_PASSWORD", "POSTGRESQL_PASSWORD", "DB_PASSWORD", "DB_PASS", "DATABASE_PASSWORD")
database_url = first("DATABASE_URL", "POSTGRES_URL", "POSTGRESQL_URL")

if database_url:
    try:
        parsed = urlparse(database_url)
        if parsed.scheme not in ("postgres", "postgresql"):
            raise ValueError("scheme")
        host = host or parsed.hostname
        port = port or (str(parsed.port) if parsed.port else None)
        database = database or unquote(parsed.path.lstrip("/")) or None
        user = user or (unquote(parsed.username) if parsed.username else None)
        password = password or (unquote(parsed.password) if parsed.password else None)
    except (ValueError, UnicodeError):
        raise SystemExit("DATABASE_URL existe, pero no pude interpretarlo. No se creó .env.production.")

missing = [name for name, value in (("PGPASSWORD", password),) if not value]
if missing:
    raise SystemExit("No encontré la contraseña de PostgreSQL en ese contenedor/imagen. No se creó .env.production; introdúcela localmente en el archivo de entorno del servidor.")

values = {
    "PGHOST": host or "postgres",
    "PGPORT": port or "5432",
    "PGDATABASE": database or "bdpicocriollo",
    "PGUSER": user or "postgres",
    "PGPASSWORD": password,
    "DATABASE_SSL": "true" if (first("DATABASE_SSL", "DB_SSL") or "false").lower() in ("true", "1", "yes") else "false",
    "APP_ORIGIN": "https://app.stereoface.online",
}
with open(destination, "w", encoding="utf-8") as handle:
    for key, value in values.items():
        handle.write(f"{key}={json.dumps(str(value), ensure_ascii=False)}\n")
PY

chmod 600 "$generated_env"
mv "$generated_env" .env.production
echo ".env.production creado con permisos 600. Los valores no se han mostrado. Revisa solo los nombres de variables; no compartas el archivo ni su contenido."
