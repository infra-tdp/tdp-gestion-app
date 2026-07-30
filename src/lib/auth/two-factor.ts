import "server-only";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sendMail } from "@/lib/mail";

/**
 * Autenticación en dos pasos. SIEMPRE activa: por defecto EMAIL (clave temporal
 * al correo del usuario); desde Seguridad se puede cambiar a TOTP (Google
 * Authenticator). Un dispositivo puede «recordarse» un máximo de 7 días: guarda
 * una cookie cuyo hash vive en trusted_devices y, mientras no caduque, entra
 * sin repetir el 2FA con una sesión que dura hasta esa caducidad.
 */

export const CHALLENGE_COOKIE = "tdp_2fa";
export const DEVICE_COOKIE = "tdp_device";
export const CHALLENGE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const TRUST_DAYS = 7;

const TOTP_ISSUER = "TDP Gestión";

export type TwoFactorMethod = "EMAIL" | "TOTP";

/* ------------------------------- Desafíos --------------------------------- */

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Crea el desafío tras validar la contraseña. Para EMAIL además envía la clave
 * temporal. Devuelve el id que debe viajar en la cookie CHALLENGE_COOKIE.
 */
export async function createChallenge(user: {
  id: number;
  email: string;
  name: string;
  method: TwoFactorMethod;
}): Promise<{ id: string; error?: string }> {
  // Limpieza oportunista de desafíos caducados
  await db.delete(schema.authChallenges).where(lt(schema.authChallenges.expiresAt, new Date()));

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);

  if (user.method === "TOTP") {
    await db.insert(schema.authChallenges).values({ id, userId: user.id, method: "TOTP", expiresAt });
    return { id };
  }

  const code = sixDigitCode();
  const sent = await sendMail({
    to: user.email,
    subject: `${code} es tu clave de acceso a TDP Gestión`,
    text:
      `Hola ${user.name}:\n\n` +
      `Tu clave temporal de acceso es: ${code}\n\n` +
      `Caduca en ${CHALLENGE_MINUTES} minutos. Si no has intentado entrar, cambia tu contraseña.`,
  });
  if (sent.error) return { id, error: sent.error };

  await db.insert(schema.authChallenges).values({
    id,
    userId: user.id,
    method: "EMAIL",
    codeHash: await bcrypt.hash(code, 10),
    expiresAt,
  });
  return { id };
}

export type ChallengeRow = typeof schema.authChallenges.$inferSelect;

/** Desafío vigente por id (null si no existe o caducó). */
export async function getChallenge(id: string): Promise<ChallengeRow | null> {
  const [row] = await db
    .select()
    .from(schema.authChallenges)
    .where(and(eq(schema.authChallenges.id, id), gt(schema.authChallenges.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/**
 * Comprueba el código contra el desafío. Consume el desafío si es correcto y
 * lo destruye también al agotar los intentos.
 */
export async function verifyChallengeCode(
  challenge: ChallengeRow,
  code: string,
  totpSecret: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, error: "La clave son 6 dígitos" };

  const ok =
    challenge.method === "TOTP"
      ? totpSecret !== null && verifyTotp(totpSecret, clean)
      : challenge.codeHash !== null && (await bcrypt.compare(clean, challenge.codeHash));

  if (ok) {
    await db.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challenge.id));
    return { ok: true };
  }

  const attempts = challenge.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challenge.id));
    return { ok: false, error: "Demasiados intentos: vuelve a iniciar sesión" };
  }
  await db
    .update(schema.authChallenges)
    .set({ attempts })
    .where(eq(schema.authChallenges.id, challenge.id));
  return { ok: false, error: `Clave incorrecta (intento ${attempts} de ${MAX_ATTEMPTS})` };
}

/* --------------------------------- TOTP ----------------------------------- */

function totp(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** URL otpauth:// para el QR de Google Authenticator y compatibles. */
export function totpUri(secret: string, email: string): string {
  return totp(secret, email).toString();
}

export function verifyTotp(secret: string, code: string): boolean {
  try {
    return totp(secret, "verify").validate({ token: code, window: 1 }) !== null;
  } catch {
    return false;
  }
}

/* ------------------------- Dispositivos de confianza ----------------------- */

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Registra este dispositivo como de confianza durante TRUST_DAYS días.
 * Devuelve el token en claro (para la cookie) y su caducidad.
 */
export async function trustDevice(
  userId: number,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 3600_000);
  await db.insert(schema.trustedDevices).values({
    userId,
    tokenHash: hashDeviceToken(token),
    userAgent: userAgent?.slice(0, 500) ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * ¿El token de la cookie corresponde a un dispositivo de confianza vigente de
 * este usuario? Refresca lastUsedAt y devuelve su caducidad (la sesión no debe
 * durar más allá).
 */
export async function checkTrustedDevice(
  userId: number,
  token: string | undefined,
): Promise<{ trusted: boolean; expiresAt?: Date }> {
  if (!token) return { trusted: false };
  const [row] = await db
    .select()
    .from(schema.trustedDevices)
    .where(
      and(
        eq(schema.trustedDevices.tokenHash, hashDeviceToken(token)),
        eq(schema.trustedDevices.userId, userId),
        gt(schema.trustedDevices.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { trusted: false };
  await db
    .update(schema.trustedDevices)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.trustedDevices.id, row.id));
  return { trusted: true, expiresAt: row.expiresAt };
}

export async function listTrustedDevices(userId: number) {
  await db.delete(schema.trustedDevices).where(lt(schema.trustedDevices.expiresAt, new Date()));
  return db
    .select()
    .from(schema.trustedDevices)
    .where(eq(schema.trustedDevices.userId, userId));
}

export async function revokeTrustedDevice(userId: number, deviceId: number): Promise<void> {
  await db
    .delete(schema.trustedDevices)
    .where(and(eq(schema.trustedDevices.id, deviceId), eq(schema.trustedDevices.userId, userId)));
}
