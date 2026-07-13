import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { aiConfigured, runAssistant } from "@/lib/ai/assistant";

export const maxDuration = 120;

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "ai.use")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "Asistente sin configurar: define ANTHROPIC_API_KEY en Coolify" },
      { status: 503 },
    );
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  try {
    const reply = await runAssistant(parsed.data.messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[ai]", err);
    return NextResponse.json({ error: "Error consultando al asistente" }, { status: 500 });
  }
}
