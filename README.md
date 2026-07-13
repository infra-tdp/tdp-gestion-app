# TDP Gestión

CRM interno de **Taller del Patinete**. Un panel único para controlar la
empresa: infraestructura, tiendas, ventas, reparaciones, stock y reposición —
con IA integrada y desplegado en **Coolify** (build desde código en cada push,
sin imágenes inmutables).

> **Fase actual: 1 — Gestión de Infraestructura.**
> El plan completo de fases (SatTPV, stock, reposición, N8N, IA) está en
> [`ROADMAP.md`](ROADMAP.md).

## Qué hace hoy

- **Dashboard** — disponibilidad, nodos, stagings, runs de tofu y actividad.
- **Nodos UpCloud** — servidores y BBDD gestionadas, start/stop/restart.
- **OpenTofu** — `plan`/`apply` de los stacks de `tdp-tienda-infra`
  (estado en Postgres, log en vivo, RBAC).
- **Disponibilidad** — monitores HTTP con uptime, latencia y alertas de caída.
- **Staging devs** — entornos efímeros de la web con la imagen de ghcr elegida,
  BD temporal restaurada del último backup de prod, devbox SSH/SFTP con la
  rama del dev, y flujo de PR sin auto-aprobación (al mergear, el CI publica
  la imagen de producción automáticamente).
- **Usuarios y RBAC** — ADMIN · INFRA · DEV · STORE · VIEWER.
- **Asistente IA** — Claude con herramientas sobre el estado real del sistema.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · PostgreSQL 17 ·
Drizzle ORM · Anthropic API · OpenTofu · Coolify API ·
diseño según la guía UI/UX TDP (tokens en `src/app/globals.css`).

## Desarrollo local

```bash
npm install
cp .env.example .env            # DATABASE_URL + AUTH_SECRET + ADMIN_*
npx drizzle-kit generate        # si cambiaste src/lib/db/schema.ts
node scripts/migrate.mjs        # aplica migraciones
npm run dev                     # http://localhost:3000
```

## Despliegue

Ver [`docs/despliegue-coolify.md`](docs/despliegue-coolify.md).
Resumen: recurso Docker Compose en Coolify desde este repo, variables de
`.env.example`, auto-deploy on push. Migraciones automáticas en el arranque,
healthcheck en `/api/health`.

## Documentación

- [`ROADMAP.md`](ROADMAP.md) — fases y decisiones.
- [`docs/integracion-sattpv.md`](docs/integracion-sattpv.md) — qué se
  sincroniza de SatTPV y qué gestiona la app (fases 2–3).
- [`docs/despliegue-coolify.md`](docs/despliegue-coolify.md) — puesta en
  producción y requisitos del módulo de staging.
