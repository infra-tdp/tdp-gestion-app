# Despliegue en Coolify

La app se **construye desde el código en cada push** (sin imagen inmutable):
Coolify clona este repo, hace build con el `Dockerfile` vía el
`docker-compose.yaml` y levanta la app. La BD es la **PostgreSQL gestionada
de UpCloud** (el compose no levanta ninguna; su servicio `db` es solo para
desarrollo local con `--profile local-db`).

## 0. Base de datos (una vez, en la PostgreSQL gestionada)

Conéctate con el usuario admin del panel de UpCloud y crea usuario y BD:

```sql
CREATE ROLE tdp WITH LOGIN PASSWORD '...';
CREATE DATABASE tdp_gestion OWNER tdp ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE tdp_gestion FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE tdp_gestion TO tdp;
```

Como owner, `tdp` crea solo las tablas (migraciones en el arranque). La URL
resultante va en `DATABASE_URL` — host y puerto los da el panel.

**TLS (obligatorio en la gestionada).** `node-postgres` trata `sslmode=require`
como verificación completa (`verify-full`) y la BD usa una CA privada que no
está en el almacén del contenedor. Dos opciones:

- **Recomendado**: pega la CA (panel de UpCloud → *CA certificate*) en la
  variable `DATABASE_CA_CERT` y deja `?sslmode=require` en la URL → verifica
  contra esa CA.
- **Rápido**: usa `?sslmode=no-verify` en la URL (cifra, no verifica el cert).

Con `?sslmode=require` **sin** `DATABASE_CA_CERT` el arranque falla con
`self-signed certificate in certificate chain`.

Asegúrate también de que la IP del server de Coolify está permitida en el
firewall de la BD gestionada (Allowed IPs) y de conectar a **una BD donde el
usuario pueda crear tablas** (owner de la base, o `GRANT CREATE ON SCHEMA
public`); en `defaultdb` con un usuario secundario suele dar
`permission denied for schema public`.

## 1. Crear el recurso

1. **+ New Resource → Docker Compose**, fuente: este repo (GitHub App),
   rama `main`, compose `docker-compose.yaml`.
2. Server: el de Coolify interno. Environment: `production`.
3. **Auto-deploy on push: ON** → cada merge a main recompila y despliega.

## 2. Variables de entorno

Pega las de [`.env.example`](../.env.example) con valores reales en
Environment Variables del recurso. Mínimo imprescindible para arrancar:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | PostgreSQL gestionada de UpCloud (`postgres://tdp:PASS@HOST:PUERTO/tdp_gestion?sslmode=require`) |
| `AUTH_SECRET` | firma de sesiones (`openssl rand -base64 48`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | primer usuario ADMIN (solo si la BD está vacía) |

El resto activa módulos según se configuren (la UI avisa de qué falta):

- **Nodos**: `UPCLOUD_USERNAME/PASSWORD` (sub-cuenta API, la misma de tofu).
- **OpenTofu**: `PG_CONN_STR` (estado, ver docs/82 del repo de infra) +
  `GITHUB_TOKEN` (clonar `tdp-tienda-infra`).
- **Staging**: `COOLIFY_URL/TOKEN/PROJECT_UUID/SERVER_UUID/GITHUB_APP_UUID`,
  `S3_*` + `BACKUP_GPG_PASSPHRASE` (backups), `STAGING_*`.
- **Monitores**: `MONITOR_DEFAULTS` (se crean solos al arrancar).
- **IA**: `ANTHROPIC_API_KEY`.

## 3. Dominio

Domain del servicio `app`: `http://gestion.tallerdelpatinete.es` (el TLS lo da
Cloudflare, igual que la web). Ruta del túnel en el control host:
`gestion.tallerdelpatinete.es → http://<IP_privada_server_coolify>:80`.

Las migraciones se aplican solas en cada arranque (`docker-entrypoint.sh`) y
`/api/health` es el healthcheck.

## 4. Requisitos para el módulo de staging

1. **PR en la web**: `docker-compose.staging.yaml` mergeado en
   `tdp-app-wordpress-prod` (PR #1).
2. **Wildcard**: `*.staging.tallerdelpatinete.es` apuntando (túnel/DNS) al
   server de Coolify donde se crean los stagings.
3. **Puertos devbox**: rango `22000-24000/tcp` accesible para los devs en ese
   server (o solo por ZeroTier, como el devbox de prod).
4. **Token de staging**: `STAGING_GIT_TOKEN` = fine-grained PAT acotado a
   `tdp-app-wordpress-prod` (contents rw) — es el que usan los devbox para
   clonar/push; NO reutilizar el `GITHUB_TOKEN` general.
5. **Registro ghcr en Coolify** ya configurado (existe: lo usa preprod).

## 5. Separación de funciones en PRs (recomendado)

La app ya impide que un dev mergee su propia PR. Para blindarlo también fuera
del panel, en `tdp-app-wordpress-prod`:
Settings → Branches → protección de `main` con "Require a pull request before
merging" + "Require approvals (1)" y "Dismiss stale approvals".

## 6. Actualizar

Push a `main` → Coolify recompila y despliega. Rollback: redeploy de un
deployment anterior desde la UI de Coolify.
