import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/* =============================================================================
   TDP Gestión — Esquema PostgreSQL
   Fase 1: usuarios/RBAC, claves SSH, monitores, runs de tofu, entornos staging.
   Las tablas de fases CRM (tiendas, ventas, stock…) llegan en fases siguientes
   (ver ROADMAP.md) — el esquema está pensado para crecer sin romper nada.
   ============================================================================= */

export const roleEnum = pgEnum("role", ["ADMIN", "INFRA", "DEV", "STORE", "VIEWER"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("VIEWER"),
  /** Para el rol STORE en fases CRM: id de la tienda a la que pertenece */
  storeId: integer("store_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sshKeys = pgTable("ssh_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  publicKey: text("public_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Disponibilidad (uptime) ---------------------- */

export const monitors = pgTable("monitors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  url: text("url").notNull(),
  method: varchar("method", { length: 10 }).notNull().default("GET"),
  expectedStatus: integer("expected_status").notNull().default(200),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  timeoutMs: integer("timeout_ms").notNull().default(10000),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitorChecks = pgTable("monitor_checks", {
  id: serial("id").primaryKey(),
  monitorId: integer("monitor_id")
    .notNull()
    .references(() => monitors.id, { onDelete: "cascade" }),
  ok: boolean("ok").notNull(),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- OpenTofu --------------------------------- */

export const tofuActionEnum = pgEnum("tofu_action", ["plan", "apply"]);
export const runStatusEnum = pgEnum("run_status", ["queued", "running", "success", "error"]);

export const tofuRuns = pgTable("tofu_runs", {
  id: serial("id").primaryKey(),
  /** Ruta del stack dentro de infra/tofu/live del repo de infraestructura */
  stack: varchar("stack", { length: 120 }).notNull(),
  action: tofuActionEnum("action").notNull(),
  status: runStatusEnum("status").notNull().default("queued"),
  triggeredBy: integer("triggered_by")
    .notNull()
    .references(() => users.id),
  /** SHA del repo de infra sobre el que se ejecutó */
  gitSha: varchar("git_sha", { length: 64 }),
  log: text("log").notNull().default(""),
  exitCode: integer("exit_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Entornos de staging -------------------------- */

export const stagingStatusEnum = pgEnum("staging_status", [
  "pending",
  "provisioning",
  "active",
  "error",
  "destroying",
  "destroyed",
]);

export const stagingEnvs = pgTable("staging_envs", {
  id: serial("id").primaryKey(),
  /** Identificador corto (subdominio, nombre de rama, nombre en Coolify) */
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => users.id),
  /** Tag de la imagen ghcr elegida (default: latest) */
  imageTag: varchar("image_tag", { length: 128 }).notNull().default("latest"),
  /** Rama creada desde main en el repo de la web */
  branch: varchar("branch", { length: 160 }).notNull(),
  status: stagingStatusEnum("status").notNull().default("pending"),
  /** UUID del recurso creado en Coolify */
  coolifyAppUuid: varchar("coolify_app_uuid", { length: 64 }),
  /** Clave S3 del backup restaurado */
  backupKey: text("backup_key"),
  /** URL pública del entorno (dominio asignado) */
  url: text("url"),
  /** Puerto SSH del devbox en el host de Coolify */
  devboxPort: integer("devbox_port"),
  /** PR abierta desde la rama (si existe) */
  prNumber: integer("pr_number"),
  prUrl: text("pr_url"),
  errorMessage: text("error_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stagingEvents = pgTable("staging_events", {
  id: serial("id").primaryKey(),
  envId: integer("env_id")
    .notNull()
    .references(() => stagingEnvs.id, { onDelete: "cascade" }),
  step: varchar("step", { length: 80 }).notNull(),
  ok: boolean("ok").notNull().default(true),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------ Notificaciones ---------------------------- */

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  /** null = broadcast para todos los usuarios con acceso */
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 60 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  read: boolean("read").notNull().default(false),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Registro de apps ----------------------------- */

/**
 * Apps gestionadas: alimentan el enrutado por Host del LB (var.apps del stack
 * coolify-prod en tdp-tienda-infra). `nodes` = claves de var.nodes donde vive la
 * app; gestion renderiza apps.auto.tfvars.json desde aquí y lanza tofu.
 */
export const apps = pgTable("apps", {
  id: serial("id").primaryKey(),
  /** Slug corto y único: clave en var.apps y nombre del backend/regla del LB */
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  /** Dominio público (cabecera Host que enruta el LB) */
  host: varchar("host", { length: 253 }).notNull(),
  /** Repositorio git de la app (para desplegar desde gestion en fases siguientes) */
  repo: text("repo"),
  /** Puerto interno del contenedor (Traefik → :port) */
  port: integer("port").notNull().default(3000),
  /** Claves de nodo (var.nodes) donde la app está desplegada, p.ej. ["1","2"] */
  nodes: jsonb("nodes").notNull().default(sql`'[]'::jsonb`),
  /** Ruta de salud para el health check por app del LB */
  healthPath: varchar("health_path", { length: 200 }).notNull().default("/api/health"),
  /** UUID del recurso en Coolify (cuando se despliegue desde gestion) */
  coolifyAppUuid: varchar("coolify_app_uuid", { length: 64 }),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- Ajustes ---------------------------------- */

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
