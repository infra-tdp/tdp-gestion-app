import { requirePermission } from "@/lib/auth/rbac";
import { getMailSettings } from "@/lib/mail";
import { Card, PageHeader } from "@/components/ui";
import { MailSettingsForm, TestMailButton, type MailFormValues } from "./mail-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Correo de notificaciones" };

export default async function MailSettingsPage() {
  await requirePermission("mail.manage");
  const settings = await getMailSettings();
  // La contraseña no sale del servidor: el cliente solo sabe si existe
  const initial: MailFormValues | null = settings
    ? {
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        user: settings.user,
        hasPass: Boolean(settings.pass),
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
        notifyByEmail: settings.notifyByEmail,
      }
    : null;

  return (
    <>
      <PageHeader eyebrow="Administración" title="Correo de notificaciones" />
      <Card className="mb-4">
        <h2 className="headline text-2xl mb-1">Servidor SMTP</h2>
        <p className="text-muted text-sm mb-4">
          Con este correo el sistema envía los códigos de verificación en dos pasos y, si lo
          activas, las notificaciones del panel. Se guarda en base de datos: sin redeploy.
        </p>
        <MailSettingsForm initial={initial} />
      </Card>
      <Card>
        <h2 className="headline text-2xl mb-3">Probar envío</h2>
        <TestMailButton disabled={!settings} />
      </Card>
    </>
  );
}
