import {
  ALL_PERMISSIONS,
  LOCKED_PERMISSIONS,
  PERMISSION_META,
  ROLES,
  getEffectiveMatrix,
  requirePermission,
  type Permission,
} from "@/lib/auth/rbac";
import { PageHeader } from "@/components/ui";
import { ResetRolesButton, RoleMatrix } from "./role-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles y permisos" };

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const matrix = await getEffectiveMatrix();

  // Agrupar permisos por módulo, preservando el orden de aparición.
  type Row = { permission: Permission; label: string; locked: boolean; roles: string[] };
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
      locked: (LOCKED_PERMISSIONS as readonly Permission[]).includes(p),
      roles: matrix[p],
    });
  }

  return (
    <>
      <PageHeader eyebrow="Administración" title="Roles y permisos" actions={<ResetRolesButton />} />
      <p className="text-muted text-sm -mt-3 mb-5">
        Marca qué rol puede cada acción, por módulo/pantalla. <b>ADMIN</b> siempre tiene todo (anti-lockout) y
        la gestión de usuarios/roles queda fija en ADMIN. Los cambios se aplican al instante.
      </p>
      <RoleMatrix roles={ROLES} modules={modules} />
    </>
  );
}
