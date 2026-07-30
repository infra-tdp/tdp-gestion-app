"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import {
  generateTotpSecret,
  revokeTrustedDevice,
  totpUri,
  verifyTotp,
} from "@/lib/auth/two-factor";

const PAGE = "/settings/seguridad";

export type SecurityState = { error?: string; ok?: string };

/* ------------------------- TOTP (Google Authenticator) --------------------- */

export type TotpSetup = { qrDataUrl: string; secret: string };

/**
 * Genera un secreto TOTP pendiente y devuelve el QR para escanearlo. El método
 * no cambia hasta confirmar un primer código válido (confirmTotpSetup).
 */
export async function beginTotpSetup(): Promise<TotpSetup | { error: string }> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  await db
    .update(schema.users)
    .set({ totpPendingSecret: secret })
    .where(eq(schema.users.id, user.id));
  const uri = totpUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { qrDataUrl, secret };
}

export async function confirmTotpSetup(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await requireUser();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row?.totpPendingSecret) return { error: "No hay configuración pendiente: vuelve a empezar" };

  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!verifyTotp(row.totpPendingSecret, code)) {
    return { error: "Código incorrecto: comprueba la app e inténtalo de nuevo" };
  }

  await db
    .update(schema.users)
    .set({ twoFactorMethod: "TOTP", totpSecret: row.totpPendingSecret, totpPendingSecret: null })
    .where(eq(schema.users.id, user.id));
  revalidatePath(PAGE);
  return { ok: "Verificación en dos pasos cambiada a Google Authenticator" };
}

/** Vuelve al método por defecto: clave temporal al correo. */
export async function switchToEmailTwoFactor(): Promise<SecurityState> {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ twoFactorMethod: "EMAIL", totpSecret: null, totpPendingSecret: null })
    .where(eq(schema.users.id, user.id));
  revalidatePath(PAGE);
  return { ok: "Verificación en dos pasos por correo activada" };
}

/* ------------------------- Dispositivos de confianza ----------------------- */

export async function revokeTrustedDeviceAction(deviceId: number): Promise<void> {
  const user = await requireUser();
  await revokeTrustedDevice(user.id, deviceId);
  revalidatePath(PAGE);
}

/* --------------------------------- Google ---------------------------------- */

export async function unlinkGoogle(): Promise<SecurityState> {
  const user = await requireUser();
  await db.update(schema.users).set({ googleSub: null }).where(eq(schema.users.id, user.id));
  revalidatePath(PAGE);
  return { ok: "Cuenta de Google desvinculada" };
}
