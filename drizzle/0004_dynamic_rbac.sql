CREATE TABLE "role_permissions" (
	"role_key" varchar(40) NOT NULL,
	"permission" varchar(80) NOT NULL,
	CONSTRAINT "role_permissions_role_key_permission_pk" PRIMARY KEY("role_key","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "roles" ("key", "name", "description", "is_system") VALUES
	('ADMIN', 'Administrador', 'Rol de sistema: acceso total. Recibe automáticamente todas las funciones nuevas y no se puede editar ni borrar.', true),
	('INFRA', 'Infraestructura', 'Operaciones: nodos, OpenTofu, apps, monitores y merges.', false),
	('DEV', 'Desarrollo', 'Entornos de staging y pull requests.', false),
	('STORE', 'Tienda', 'Acceso de tienda (fases CRM).', false),
	('VIEWER', 'Solo lectura', 'Consulta sin acciones.', false);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE varchar(40) USING "role"::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'VIEWER';--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_key_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
DROP TYPE "public"."role";
