import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "tofu.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const [run] = await db
    .select({ log: schema.tofuRuns.log, status: schema.tofuRuns.status })
    .from(schema.tofuRuns)
    .where(eq(schema.tofuRuns.id, Number(id)));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}
