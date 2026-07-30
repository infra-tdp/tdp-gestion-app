import { requirePermission } from "@/lib/auth/rbac";
import { NAV, loadNavOverrides } from "@/lib/nav";
import { PageHeader } from "@/components/ui";
import { NavEditor, ResetNavButton } from "./nav-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menú de navegación" };

export default async function NavAdminPage() {
  await requirePermission("nav.manage");
  const overrides = await loadNavOverrides();

  return (
    <>
      <PageHeader eyebrow="Administración" title="Menú de navegación" actions={<ResetNavButton />} />
      <p className="text-muted text-sm -mt-3 mb-5">
        Organiza el menú lateral para todos los usuarios: renombra cualquier opción y cambia su posición con
        las flechas. Los cambios se guardan al momento; el nombre original se conserva como referencia y las
        pantallas nuevas que se añadan aparecerán al final de su grupo. Qué ve cada usuario lo deciden los
        permisos de su rol, no este menú.
      </p>
      <NavEditor tree={NAV} initial={overrides} />
    </>
  );
}
