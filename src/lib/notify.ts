import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sendNotificationMail } from "@/lib/mail";

/**
 * Punto ÚNICO para crear notificaciones del sistema: inserta la fila del panel
 * y, si el admin activó «notificaciones por email» (Administración → Correo),
 * la reenvía por correo — al destinatario o, si es broadcast (userId null), a
 * todos los usuarios activos. El email es best-effort: nunca rompe el flujo.
 */
export async function createNotification(input: {
  /** null/undefined = broadcast para todos */
  userId?: number | null;
  type: string;
  title: string;
  body?: string | null;
  meta?: unknown;
}): Promise<void> {
  await db.insert(schema.notifications).values({
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    meta: input.meta,
  });

  try {
    if (input.userId) {
      const [user] = await db
        .select({ email: schema.users.email, active: schema.users.active })
        .from(schema.users)
        .where(eq(schema.users.id, input.userId))
        .limit(1);
      if (user?.active) await sendNotificationMail(user.email, input.title, input.body);
    } else {
      const users = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.active, true));
      for (const u of users) await sendNotificationMail(u.email, input.title, input.body);
    }
  } catch (e) {
    console.error("[notify] fallo enviando emails de notificación:", e);
  }
}
