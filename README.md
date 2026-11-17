# Pico Criollo

<p align="center">
  <strong>Gestión avícola, trazabilidad y comunidad en una sola plataforma.</strong>
</p>

<p align="center">
  <img alt=".NET 10" src="https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-React_Native-000020?logo=expo&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-2C7048">
</p>

Pico Criollo ayuda a criadores a administrar sus granjas, documentar la procedencia de sus aves y participar en una comunidad especializada. La aplicación combina una API en **.NET 10**, una interfaz multiplataforma en **Expo / React Native** y persistencia en **PostgreSQL**.

La misma base de código de la interfaz funciona en web, Android e iOS. En producción, la API y la aplicación web se publican como contenedores independientes detrás de un proxy o Cloudflare Tunnel.

## Funcionalidades principales

- **Mi granja:** gallineros, aves, fotografías, recolección de huevos, inventario, compras, agenda e incubaciones.
- **Trazabilidad:** anillos, códigos permanentes, lotes, procedencia y árbol genealógico con padres, abuelos y descendientes.
- **Ventas y POS:** clientes, catálogo, recibos, abonos, devoluciones, cancelaciones y reportes comerciales.
- **Mercado avícola:** aves, lotes, huevos e insumos; publicaciones, subastas, mensajería y flujo de compraventa.
- **Comunidad:** perfiles, seguidores, publicaciones, reels, videos, comentarios, reacciones y contenido destacado.
- **Notificaciones:** bandeja, preferencias, recordatorios de la granja y soporte para notificaciones push de Expo.
- **Moderación:** denuncias, revisión de contenido y reglas de privacidad para datos de contacto.
- **Autenticación:** registro, inicio de sesión, renovación segura de tokens y recuperación de contraseña.

## Arquitectura

```text
pico-criollo/
├── api/                    # Solución .NET 10
│   ├── API/                # HTTP, autenticación, OpenAPI y servicios en segundo plano
│   ├── Domain/             # Entidades, DTO y reglas del negocio
│   ├── Persistence/        # PostgreSQL, consultas y comandos
│   ├── Infrastructure/     # Integraciones externas
│   └── Tests/              # Pruebas automatizadas
├── mobile/                 # Expo Router + React Native
│   ├── src/app/            # Rutas públicas y autenticadas
│   ├── src/features/       # Granja, mercado, social, ventas y notificaciones
│   ├── src/components/     # Sistema de componentes compartidos
│   └── tests/              # Reglas de interfaz y dominio cliente
├── database/               # Esquema y migraciones de referencia
├── docs/                   # Diseño, migración y operación
├── scripts/                # Despliegue, pruebas de humo y datos de demostración
└── docker-compose.nueva.yml
```

La API sigue una separación por capas:

```text
API → Persistence / Infrastructure → Domain
```

La interfaz consume un contrato OpenAPI versionado. El cliente tipado se regenera desde la API para detectar cambios incompatibles durante la compilación.

## Requisitos

- [.NET SDK 10](https://dotnet.microsoft.com/download)
- [Node.js 22 o superior](https://nodejs.org/)
- npm
- PostgreSQL para persistencia real, o Docker para levantar la pila de producción

La API puede ejecutarse en desarrollo con almacenamiento en memoria, por lo que PostgreSQL no es obligatorio para una primera revisión local.

## Inicio rápido

### 1. Ejecutar la API

```bash
dotnet restore api/PicoCriollo.sln
dotnet run --project api/API --urls http://127.0.0.1:5188
```

La documentación OpenAPI se habilita en desarrollo. La comprobación de salud está disponible en:

```text
http://127.0.0.1:5188/api/health
```

### 2. Ejecutar la aplicación Expo

En otra terminal:

```bash
cd mobile
cp .env.example .env
npm install
npm run web
```

También puedes iniciar una plataforma nativa:

```bash
npm run android
npm run ios
```

La variable principal del cliente es:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:5188
```

> En un teléfono físico, usa la dirección IP local del equipo que ejecuta la API en lugar de `127.0.0.1`.

## Configuración de producción

Crea el archivo privado de configuración a partir de la plantilla:

```bash
cp .env.api.example .env.api
```

Variables obligatorias:

| Variable | Propósito |
|---|---|
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Conexión a PostgreSQL |
| `JWT_KEY` | Firma de los tokens de sesión; usa una cadena aleatoria de al menos 32 caracteres |
| `APP_ORIGEN` | URL pública de la aplicación web y origen autorizado por CORS |
| `API_URL_PUBLICA` | URL pública de la API incorporada al construir Expo Web |

SMTP, Expo Push y publicación de OpenAPI son opcionales. Consulta [.env.api.example](.env.api.example) para ver todas las opciones.

Nunca confirmes `.env`, `.env.api`, llaves privadas, tokens ni copias de bases de datos en Git.

## Docker

La pila activa usa dos servicios y una red externa llamada `backend`:

- `pico-criollo-api` — API .NET en el puerto interno `8080`.
- `pico-criollo-web` — exportación web de Expo servida por Nginx en el puerto interno `8080`.

```bash
docker network create backend # solo si todavía no existe
docker compose -f docker-compose.nueva.yml --env-file .env.api build
docker compose -f docker-compose.nueva.yml --env-file .env.api up -d
docker compose -f docker-compose.nueva.yml --env-file .env.api ps
```

El archivo Compose no publica puertos directamente al host. El proxy inverso o Cloudflare Tunnel debe estar conectado a la misma red `backend`.

## Calidad y pruebas

### API

```bash
dotnet build api/PicoCriollo.sln
dotnet test api/PicoCriollo.sln
```

### Expo

```bash
npm --prefix mobile run typecheck
npm --prefix mobile test
```

### Cliente OpenAPI

Con la API en ejecución:

```bash
npm --prefix mobile run api:generar
```

## Seguridad y datos

- Las contraseñas se almacenan mediante hash; nunca se guardan en texto plano.
- La sesión usa tokens de acceso breves y tokens de actualización rotativos.
- Los datos de contacto se protegen durante las operaciones del mercado.
- Los archivos multimedia se validan y los videos se procesan antes de publicarse.
- Los secretos de producción pertenecen únicamente al servidor y están excluidos del repositorio.
- Antes de cualquier despliegue o migración, realiza una copia verificable de PostgreSQL.

## Estado de la migración

La implementación activa es **.NET 10 + Expo**. El código de la aplicación Next.js original permanece temporalmente en `src/` como referencia funcional y visual mientras se completa la validación de paridad. No debe considerarse el punto de entrada principal para nuevos desarrollos.

El avance y el procedimiento de corte están documentados en [docs/CORTE.md](docs/CORTE.md). La operación de la versión publicada se describe en [docs/PRODUCCION-20261103.md](docs/PRODUCCION-20261103.md).

## Documentación

- [Guía de despliegue](DEPLOYMENT.md)
- [Sistema visual](DESIGN.md)
- [Visión del producto](PRODUCT.md)
- [Estado y corte de la migración](docs/CORTE.md)
- [API .NET](api/README.md)
- [Aplicación Expo](mobile/README.md)

## Licencia

Este proyecto se distribuye bajo la licencia [MIT](LICENSE).

---

Hecho con cuidado ♥ por **Steven Jocz**.
