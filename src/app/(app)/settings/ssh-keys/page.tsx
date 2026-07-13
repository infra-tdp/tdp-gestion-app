import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { Card, PageHeader, formatDate } from "@/components/ui";
import { SshKeyControls } from "./ssh-key-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claves SSH" };

export default async function SshKeysPage() {
  const user = await requireUser();
  const keys = await db
    .select()
    .from(schema.sshKeys)
    .where(eq(schema.sshKeys.userId, user.id))
    .orderBy(desc(schema.sshKeys.createdAt));

  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Claves SSH" />
      <p className="text-muted text-sm mb-4 max-w-2xl">
        Estas claves públicas se inyectan en los <b className="text-text">devbox de tus entornos staging</b> para que puedas
        entrar por SSH/SFTP. Genera una con{" "}
        <code className="text-primary">ssh-keygen -t ed25519 -C &quot;tu@email&quot;</code> y pega el contenido del{" "}
        <code className="text-primary">.pub</code>.
      </p>

      <Card className="mb-4">
        <SshKeyControls keys={keys.map((k) => ({ id: k.id, name: k.name, publicKey: k.publicKey, createdAt: k.createdAt.toISOString() }))} />
      </Card>

      {keys.length > 0 && (
        <p className="text-muted text-[12px]">
          Última clave añadida: {formatDate(keys[0].createdAt)} · Los entornos ya desplegados no se actualizan — crea uno nuevo
          si añades una clave.
        </p>
      )}
    </>
  );
}
