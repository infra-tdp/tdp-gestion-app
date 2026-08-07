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

## 6. Higiene de disco en los nodos (volúmenes huérfanos)

Los stagings son stacks Docker Compose con volúmenes con nombre (`mysql-data`,
`wp-code`, `devbox-home`, `restore-state`, `fastcgi-cache`). Al destruirlos hay
que asegurarse de que esos volúmenes se van con ellos, o el disco del nodo se
llena solo: en `coolify-prod-2` se acumularon 25 GB en `/var/lib/docker/volumes`
(5 juegos completos de stagings ya destruidos, sin ningún contenedor asociado).

**Por qué pasaba.** Coolify borra los recursos en este orden
(`app/Jobs/DeleteResourceJob.php`): primero `deleteConfigurations()`
(`rm -rf /data/coolify/applications/<uuid>`) y después `deleteVolumes()`, que
para un recurso Compose es `cd /data/coolify/applications/<uuid> && docker
compose down -v`. Si se pide borrar configuraciones, el `cd` apunta a un
directorio que Coolify acaba de borrar: el comando falla en silencio
(`throwError: false`), el DELETE responde 200 y los volúmenes se quedan
huérfanos. El `docker_cleanup` posterior tampoco los toca — Coolify lo lanza
con `deleteUnusedVolumes: false`, así que poda imágenes y contenedores, nunca
volúmenes.

**Lo que hace la app.** `deleteApp()` manda `delete_configurations=false`, de
modo que el directorio sobrevive al `compose down -v` y los volúmenes se
liberan de verdad; solo queda atrás el directorio de configuración (unos KB de
yaml/env frente a varios GB de volúmenes). Además, tras el DELETE la app espera
a que el recurso desaparezca de la API antes de dar el entorno por destruido —
el DELETE solo *encola* el borrado — y lo registra en el historial del entorno.

**Lo que hay que activar a mano (una vez por nodo).** Coolify → Servers → el
nodo → Advanced → **Delete unused volumes**. Es lo único que añade
`docker volume prune -af` a la limpieza periódica y cubre lo que se borre
directamente desde el panel de Coolify, fuera de este panel. La API expone el
ajuste en `GET /servers` pero no deja cambiarlo, así que Infraestructura →
Nodos muestra el estado por nodo y avisa mientras siga desactivado.

Limpieza puntual de lo ya acumulado (comprobando antes que nadie los usa con
`docker ps -a --filter volume=<nombre>`): `docker volume rm <nombre>`, o
`docker volume prune -f` para barrer todos los que no tengan contenedor.

## 7. Actualizar

Push a `main` → Coolify recompila y despliega. Rollback: redeploy de un
deployment anterior desde la UI de Coolify.
