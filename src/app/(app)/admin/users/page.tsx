import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getRoles, requirePermission } from "@/lib/auth/rbac";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { UserForm, UserRowActions, type RoleOption } from "./user-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const [users, allRoles] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.id)),
    getRoles(),
  ]);
  const roleOptions: RoleOption[] = allRoles.map((r) => ({ key: r.key, name: r.name }));

  return (
    <>
      <PageHeader eyebrow="Administración" title="Usuarios y roles" />

      <Card className="mb-4">
        <h2 className="headline text-2xl mb-3">Crear usuario</h2>
        <UserForm roles={roleOptions} />
        <p className="text-muted text-[12px] mt-3">
          Roles disponibles: {allRoles.map((r, i) => (
            <span key={r.key}>
              {i > 0 && " · "}
              <b>{r.key}</b> {r.name.toLowerCase()}
            </span>
          ))}
          . Se crean y configuran en{" "}
          <Link href="/admin/roles" className="text-primary underline">
            Roles y permisos
          </Link>
          .
        </p>
      </Card>

      <Card accent={false} className="!p-0 overflow-x-auto">
        <table className="tdp-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Alta</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-muted text-[12px]">{u.email}</div>
                </td>
                <td>
                  <Badge tone={u.role === "ADMIN" ? "success" : "outline"}>{u.role}</Badge>
                </td>
                <td>{u.active ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Desactivado</Badge>}</td>
                <td className="text-muted">{formatDate(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== me.id ? (
                    <UserRowActions userId={u.id} role={u.role} active={u.active} roles={roleOptions} />
                  ) : (
                    <span className="text-muted text-[12px]">tú</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
