# TDP Gestión — Roadmap

CRM interno de Taller del Patinete. Un solo panel para controlar la empresa:
infraestructura, tiendas, ventas, reparaciones, stock y reposición — con IA
integrada y desplegado en Coolify (build desde código en cada push).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind 4 · PostgreSQL 17 ·
Drizzle ORM · RBAC propio · Anthropic API · OpenTofu · Coolify API.
**Diseño:** guía UI/UX TDP (tokens exactos en `src/app/globals.css`).

---

## ✅ FASE 1 — Gestión de Infraestructura (esta entrega)

| Módulo | Estado | Detalle |
|---|---|---|
| Auth + RBAC | ✅ | Roles ADMIN / INFRA / DEV / STORE / VIEWER, sesiones JWT httpOnly, seed del admin por env |
| Nodos UpCloud | ✅ | Listado, estado, IPs, bases de datos gestionadas, start/stop/restart con confirmación |
| OpenTofu | ✅ | Runner con clone de `tdp-tienda-infra`, `plan`/`apply` por stack (`prod`, `coolify`, `coolify-prod`), backend `pg`, log en vivo, RBAC (apply solo ADMIN/INFRA) |
| Disponibilidad | ✅ | Monitores HTTP con historial, uptime 24h, latencia, notificación en la transición a caído, seed por `MONITOR_DEFAULTS` |
| Staging devs | ✅ | Solicitud con tag de ghcr (default `latest`), rama desde main, MySQL temporal restaurado del último backup S3 (GPG), devbox SSH/SFTP con claves del dev y repo clonado, TTL con autodestrucción, destroy manual |
| Flujo PR | ✅ | El dev abre la PR desde el panel; **no puede aprobar la suya** — merge solo ADMIN/INFRA distinto del autor; al mergear, el CI del repo publica la imagen de prod |
| Claves SSH | ✅ | Autogestión por dev, se inyectan en los devbox |
| Notificaciones | ✅ | Centro de notificaciones (caídas, stagings, PRs, nodos) — base para las fases CRM |
| Asistente IA | ✅ | Claude con herramientas de solo lectura sobre monitores, nodos, stagings y runs |

**Pendiente de configurar en producción (no es código):** variables de entorno
en Coolify (ver `.env.example`), wildcard DNS `*.staging...`, y apertura de los
puertos devbox (`22000+`) en el firewall/ZeroTier del server de staging.

---

## 🔜 FASE 2 — Facturación y actividad por tiendas (SatTPV)

Fuente: API v3 de SatTPV (`https://api-v3.sattpv.net`) — ver
[`docs/integracion-sattpv.md`](docs/integracion-sattpv.md) con el mapeo completo
de endpoints y qué se sincroniza vs. qué gestionamos nosotros.

- **Sync service**: worker que recorre las cuentas SatTPV de cada tienda
  (credenciales por tienda en BD, cifradas) y vuelca en PostgreSQL:
  `/sales` (con `sale_multishop`), `/invoices`, `/repairs`, `/movements`,
  `/products`. Incremental por fecha + reconciliación nocturna.
- **Facturación por tiendas**: hoy, mes en curso, últimos 30 días, nº de
  ventas, ticket medio, comparativa y ranking entre tiendas.
- **Ficha de tienda**: detalle de facturación, ventas, productos vendidos,
  evolución (gráficas), reparaciones.
- **Ventas vs taller**: separación clara venta de patinetes / recambios y
  accesorios / facturación procedente de reparaciones (conceptos + categorías).
- **Reparaciones**: abiertas / finalizadas / entregadas por tienda y día
  (estados de `/repairs` con sus colores).
- **Dashboard general**: actividad diaria por establecimiento
  (“Tarragona: 7 ventas y 4 reparaciones hoy”), rankings, patinetes vendidos.
- **RBAC STORE**: cada tienda entra y ve SOLO sus datos; central lo ve todo.

## 🔜 FASE 3 — Stock y reposición automática

SatTPV da stock por cuenta (`product_units`, `product_min_stock`) pero NO
traspasos entre tiendas ni “pendiente de recibir” → eso vive en nuestra BD.

- **Stock por tienda en tiempo real** (sync de `/products` por tienda).
- **Movimientos**: envíos de central, traspasos tienda↔tienda, confirmación
  de recepción por la tienda (aparece al instante en el panel central).
- **Pendientes de recibir** + historial completo de entradas/ventas/traspasos.
- **Reposición automática**: al detectar una venta, descuento de stock y
  alerta “Valencia necesita reponer 1 Rovoron S7”; apartado “Necesidades de
  reposición” (tienda, modelo, unidades restantes, recomendadas, última venta,
  estado pendiente/enviado/recibido).
- **Stock mínimo por modelo y tienda** con alertas automáticas.
- **Descuadres**: diff entre stock esperado (nuestros movimientos) y el real
  de SatTPV → notificación.

## 🔜 FASE 4 — Notificaciones multicanal + N8N

- Eventos: venta de patinete, rotura de stock, bajo mínimo, recepción
  confirmada, traspaso, descuadre (además de los de infraestructura).
- **N8N**: la app emite webhooks firmados por evento → flujos N8N para
  Telegram/WhatsApp/email sin tocar código. Endpoint de entrada para que N8N
  también pueda inyectar eventos (p. ej. formularios externos).
- Preferencias de notificación por usuario/rol/tienda.

## 🔜 FASE 5 — IA transversal

- Asistente con herramientas sobre ventas/stock/reposición (“¿qué modelos
  debería enviar a Valencia esta semana?”).
- Resumen diario automático (cron → notificación con el día de cada tienda).
- Detección de anomalías (caída de ventas, ticket medio raro, stock inmóvil).

---

## Decisiones tomadas

- **PostgreSQL** sobre MySQL para la app: JSONB para payloads de sync SatTPV,
  advisory locks (mismo patrón que el backend pg de tofu), particionado futuro
  del histórico de checks/ventas.
- **Sin imágenes inmutables para ESTA app**: Coolify construye con el
  Dockerfile en cada push (la web WP sí sigue con su imagen inmutable, como ya
  está montado).
- **Scheduler en proceso** (una réplica): sin Redis/colas hasta que haga falta.
- **Separación de funciones en PRs**: regla de negocio en la app + recomendable
  activar branch protection en GitHub (ver docs/despliegue-coolify.md).
