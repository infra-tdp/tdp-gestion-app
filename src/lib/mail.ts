import "server-only";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Correo saliente del sistema (notificaciones, códigos 2FA…). La configuración
 * SMTP vive en app_settings["mail.smtp"] y se edita desde Administración →
 * Correo de notificaciones, sin redeploy — mismo patrón que nav.overrides.
 */
export const MAIL_SETTINGS_KEY = "mail.smtp";

export type MailSettings = {
  host: string;
  port: number;
  /** true = TLS implícito (465); false = STARTTLS/claro según el servidor */
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  /** Enviar también por email las notificaciones internas del panel */
  notifyByEmail: boolean;
};

export async function getMailSettings(): Promise<MailSettings | null> {
  try {
    const [row] = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, MAIL_SETTINGS_KEY))
      .limit(1);
    if (!row?.value) return null;
    const v = row.value as Partial<MailSettings>;
    if (!v.host || !v.fromEmail) return null;
    return {
      host: v.host,
      port: Number(v.port) || 587,
      secure: Boolean(v.secure),
      user: v.user ?? "",
      pass: v.pass ?? "",
      fromName: v.fromName ?? "TDP Gestión",
      fromEmail: v.fromEmail,
      notifyByEmail: Boolean(v.notifyByEmail),
    };
  } catch {
    return null; // BD aún no lista
  }
}

export async function saveMailSettings(settings: MailSettings): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key: MAIL_SETTINGS_KEY, value: settings })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: settings, updatedAt: new Date() },
    });
}

export async function isMailConfigured(): Promise<boolean> {
  return (await getMailSettings()) !== null;
}

function transporter(s: MailSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ error?: string }> {
  const s = await getMailSettings();
  if (!s) return { error: "El correo del sistema no está configurado (Administración → Correo)." };
  try {
    await transporter(s).sendMail({
      from: `"${s.fromName}" <${s.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[mail] fallo enviando a ${input.to}: ${msg}`);
    return { error: `No se pudo enviar el correo: ${msg}` };
  }
}

/**
 * Notificación por email (best-effort): solo si el admin activó `notifyByEmail`.
 * Nunca lanza — el flujo que notifica no debe romperse por un fallo SMTP.
 */
export async function sendNotificationMail(to: string, title: string, body?: string | null): Promise<void> {
  const s = await getMailSettings();
  if (!s?.notifyByEmail) return;
  await sendMail({
    to,
    subject: `[TDP Gestión] ${title}`,
    text: body || title,
  });
}
