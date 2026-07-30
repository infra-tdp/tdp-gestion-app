import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { isGoogleConfigured } from "@/lib/auth/google";
import { listTrustedDevices } from "@/lib/auth/two-factor";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { GoogleControls, RevokeDeviceButton, TwoFactorControls } from "./security-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguridad" };

const GOOGLE_ERRORS: Record<string, string> = {
  email: "Esa cuenta de Google no usa tu mismo correo: solo puedes vincular la de tu email del panel.",
  conflict: "Esa cuenta de Google ya está vinculada a otro usuario.",
  state: "La solicitud caducó o no es válida: inténtalo de nuevo.",
  token: "Google no pudo verificar tu identidad: inténtalo de nuevo.",
  denied: "Has cancelado el acceso en Google.",
  unverified: "Tu correo de Google no está verificado.",
  session: "Tu sesión caducó durante la vinculación: entra y repítela.",
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; google_error?: string }>;
}) {
  const me = await requireUser();
  const { google, google_error: googleError } = await searchParams;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  const devices = await listTrustedDevices(me.id);

  return (
    <>
      <PageHeader eyebrow="Ajustes" title="Seguridad de tu cuenta" />

      <Card className="mb-4">
        <h2 className="headline text-2xl mb-1">Inicio de sesión rápido con Google</h2>
        {google === "linked" && (
          <p className="text-sm font-semibold mb-2">✓ Cuenta de Google vinculada correctamente.</p>
        )}
        {googleError && (
          <p className="text-danger text-sm font-semibold mb-2">
            {GOOGLE_ERRORS[googleError] ?? "No se pudo vincular la cuenta de Google."}
          </p>
        )}
        <GoogleControls linked={Boolean(row?.googleSub)} enabled={isGoogleConfigured()} />
      </Card>

      <Card className="mb-4">
        <h2 className="headline text-2xl mb-1">Verificación en dos pasos</h2>
        <p className="text-muted text-sm mb-3">
          Siempre activa. Por defecto recibes una clave temporal en tu correo; si lo prefieres,
          usa Google Authenticator.
        </p>
        <TwoFactorControls method={row?.twoFactorMethod ?? "EMAIL"} />
      </Card>

      <Card accent={false} className="!p-0 overflow-x-auto">
        <div className="p-5 pb-0">
          <h2 className="headline text-2xl mb-1">Dispositivos recordados</h2>
          <p className="text-muted text-sm mb-3">
            Estos dispositivos entran sin repetir la verificación durante un máximo de 7 días.
          </p>
        </div>
        {devices.length === 0 ? (
          <p className="text-muted text-sm p-5 pt-2">
            No hay dispositivos recordados. Marca «Recordar este dispositivo 7 días» al verificar
            tu acceso.
          </p>
        ) : (
          <table className="tdp-table">
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>Último uso</th>
                <th>Caduca</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="text-[12px] max-w-90 truncate" title={d.userAgent ?? ""}>
                    {d.userAgent ?? "desconocido"}
                  </td>
                  <td className="text-muted">{formatDate(d.lastUsedAt)}</td>
                  <td>
                    <Badge tone="outline">{formatDate(d.expiresAt)}</Badge>
                  </td>
                  <td className="text-right">
                    <RevokeDeviceButton deviceId={d.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
