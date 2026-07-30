import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  ALL_PERMISSIONS,
  PERMISSION_META,
  SENSITIVE_PERMISSIONS,
  getEffectiveMatrix,
  getRoles,
  requirePermission,
  type Permission,
} from "@/lib/auth/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ResetRolesButton, RoleManager, RoleMatrix, type RoleView } from "./role-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles y permisos" };

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const [roles, matrix, counts] = await Promise.all([
    getRoles(),
    getEffectiveMatrix(),
    db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role),
  ]);
  const usersByRole = new Map(counts.map((c) => [c.role, c.n]));
  const roleViews: RoleView[] = roles.map((r) => ({
    ...r,
    users: usersByRole.get(r.key) ?? 0,
  }));

  // Agrupar permisos por módulo, preservando el orden de aparición.
  type Row = { permission: Permission; label: string; sensitive: boolean; roles: string[] };
  const modules: { module: string; rows: Row[] }[] = [];
  const idx = new Map<string, number>();
  for (const p of ALL_PERMISSIONS) {
    const { module, label } = PERMISSION_META[p];
    if (!idx.has(module)) {
      idx.set(module, modules.length);
      modules.push({ module, rows: [] });
    }
    modules[idx.get(module)!].rows.push({
      permission: p,
      label,
      sensitive: (SENSITIVE_PERMISSIONS as readonly Permission[]).includes(p),
      roles: matrix[p],
    });
  }

  return (
    <>
      <PageHeader eyebrow="Administración" title="Roles y permisos" actions={<ResetRolesButton />} />
      <p className="text-muted text-sm -mt-3 mb-5">
        Crea y edita roles a medida y marca qué puede hacer cada uno, por módulo/pantalla. <b>ADMIN</b> es un
        rol de sistema de solo lectura: siempre tiene todo, incluidas las funciones que se añadan en el futuro.
        Los permisos de Administración se pueden conceder a otros roles, pero llevan aviso ⚠ : quien los tenga
        puede gestionar usuarios y roles (y ampliar sus propios permisos). Los cambios se aplican al instante.
      </p>

      <Card className="mb-5">
        <h2 className="headline text-2xl mb-4">Roles</h2>
        <RoleManager roles={roleViews} />
      </Card>

      <RoleMatrix roles={roleViews} modules={modules} />
    </>
  );
}
