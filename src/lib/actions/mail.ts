"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/rbac";
import { getMailSettings, saveMailSettings, sendMail, type MailSettings } from "@/lib/mail";

export type MailFormState = { error?: string; ok?: string };

export async function saveMailSettingsAction(
  _prev: MailFormState,
  formData: FormData,
): Promise<MailFormState> {
  await assertPermission("mail.manage");
  const current = await getMailSettings();

  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 587);
  const fromEmail = String(formData.get("fromEmail") ?? "").trim().toLowerCase();
  if (!host) return { error: "El host SMTP es obligatorio" };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Puerto inválido" };
  if (!fromEmail.includes("@")) return { error: "El email remitente es obligatorio" };

  // Contraseña vacía = conservar la guardada (nunca se pinta en el formulario)
  const pass = String(formData.get("pass") ?? "");
  const settings: MailSettings = {
    host,
    port,
    secure: formData.get("secure") === "on",
    user: String(formData.get("user") ?? "").trim(),
    pass: pass || current?.pass || "",
    fromName: String(formData.get("fromName") ?? "").trim() || "TDP Gestión",
    fromEmail,
    notifyByEmail: formData.get("notifyByEmail") === "on",
  };
  await saveMailSettings(settings);
  revalidatePath("/admin/correo");
  return { ok: "Configuración guardada" };
}

export async function sendTestMailAction(
  _prev: MailFormState,
  _formData: FormData,
): Promise<MailFormState> {
  const admin = await assertPermission("mail.manage");
  const res = await sendMail({
    to: admin.email,
    subject: "[TDP Gestión] Correo de prueba",
    text: `Hola ${admin.name}:\n\nSi lees esto, el correo de notificaciones de TDP Gestión está bien configurado.`,
  });
  if (res.error) return { error: res.error };
  return { ok: `Correo de prueba enviado a ${admin.email}` };
}
