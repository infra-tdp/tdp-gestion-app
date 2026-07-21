# Despliegue en Coolify

La app se **construye desde el código en cada push** (sin imagen inmutable):
Coolify clona este repo, hace build con el `Dockerfile` vía el
`docker-compose.yaml` y levanta la app. La BD es la **PostgreSQL gestionada
de UpCloud** (el compose no levanta ninguna; su servicio `db` es solo para
desarrollo local con `--profile local-db`).

> **Coolify es efímero — flujo recomendado sin configuración manual.**
> Todo lo que necesita Coolify está en el repo, y las variables viven como
> **Secrets/Variables del repo en GitHub** (mismos nombres que
> `.env.example`; el PAT se llama `TDP_GITHUB_TOKEN` y la org
> `TDP_GITHUB_ORG` — Actions no permite el prefijo `GITHUB_`). El workflow
> [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):
>
> - **bootstrap** (Run workflow, manual): crea el recurso por API en un
>   Coolify nuevo, sincroniza envs, fija el dominio (`GESTION_DOMAIN`) y
>   despliega — guarda `COOLIFY_APP_UUID` como variable del repo.
> - **deploy** (en cada push a main, o manual): re-sincroniza envs/dominio y
>   fuerza el deploy. Idempotente.
>
> Los pasos 1–3 de abajo describen el equivalente manual en la UI, útil como
> referencia; con el workflow no hacen falta. `COOLIFY_API_URL` debe ser
> alcanzable desde los runners de GitHub (la URL pública del panel).

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
- **Staging**: `COOLIFY_API_URL` (origen de la API, p. ej. `http://10.0.0.16:8000`;
  **no** uses `COOLIFY_URL`, es reservada y Coolify la pisa con la URL de la app) +
  `COOLIFY_TOKEN/PROJECT_UUID/SERVER_UUID/GITHUB_APP_UUID`,
  `S3_*` + `BACKUP_GPG_PASSPHRASE` (backups), `STAGING_*`.
- **Monitores**: `MONITOR_DEFAULTS` (se crean solos al arrancar).
- **IA**: `ANTHROPIC_API_KEY`.

## 3. Dominio

Mismo patrón que `tdp-app-wordpress-prod` (que ya despliega bien): Coolify
inyecta el router de Traefik **desde el campo "Domains for app" de la UI** y
enruta al puerto que el servicio expone. Por eso el compose:

- **expone** el puerto de la app: `expose: ["3000"]`;
- une el contenedor a la red `coolify` (donde vive Traefik) con la label
  `traefik.docker.network=coolify`.

Configuración en Coolify:

- **"Domains for app"** = `http://gestion.tallerdelpatinete.es` (con `http://`;
  el TLS lo termina Cloudflare, igual que la web). NO lo dejes vacío.
- Túnel Cloudflare: `gestion.tallerdelpatinete.es → http://<server_coolify>:80`
  (o el LB de UpCloud que ya usa preprod).

Si sale `404 page not found`, es Traefik sin ruta para ese host: revisa que el
"Domains for app" esté puesto, que el servicio exponga `3000` y que el
contenedor esté en la red `coolify` (el 404 lo devuelve Traefik, no la app).

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
