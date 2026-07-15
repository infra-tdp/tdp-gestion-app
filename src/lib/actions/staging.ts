"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPermission } from "@/lib/auth/rbac";
import { destroyStagingEnv, redeployStagingEnv, requestStagingEnv } from "@/lib/staging/orchestrator";
import { createPullRequest, getPullRequest, mergePullRequest } from "@/lib/infra/github";

export async function requestStaging(formData: FormData): Promise<{ id?: number; error?: string }> {
  const user = await assertPermission("staging.request");
  const buildFromBranch = String(formData.get("source") ?? "build") !== "image";
  const imageTag = String(formData.get("imageTag") ?? "latest").trim() || "latest";
  const backupKey = String(formData.get("backupKey") ?? "").trim(); // vacío = más reciente
  const serverUuid = String(formData.get("serverUuid") ?? "").trim(); // vacío = COOLIFY_SERVER_UUID
  const projectUuid = String(formData.get("projectUuid") ?? "").trim(); // vacío = COOLIFY_PROJECT_UUID
  const ttlHours = Math.min(Math.max(Number(formData.get("ttlHours") ?? 72), 1), 24 * 14);
  if (!buildFromBranch && !/^[\w][\w.-]{0,127}$/.test(imageTag)) {
    return { error: "Tag de imagen inválido" };
  }
  if (backupKey && !/^[\w./-]{1,256}\.sql\.gz\.gpg$/.test(backupKey)) {
    return { error: "Clave de backup inválida" };
  }
  if (serverUuid && !/^[\w-]{1,64}$/.test(serverUuid)) {
    return { error: "Servidor de Coolify inválido" };
  }
  if (projectUuid && !/^[\w-]{1,64}$/.test(projectUuid)) {
    return { error: "Proyecto de Coolify inválido" };
  }
  try {
    const id = await requestStagingEnv({
      userId: user.id,
      userName: user.name,
      buildFromBranch,
      imageTag,
      backupKey,
      serverUuid,
      projectUuid,
      ttlHours,
    });
    revalidatePath("/staging");
    return { id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Redespliega el entorno (rebuild de la rama) tras hacer push desde el devbox. */
export async function redeployStaging(envId: number): Promise<{ error?: string }> {
  const user = await assertPermission("staging.view");
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) return { error: "Entorno no encontrado" };
  if (env.requestedBy !== user.id) {
    try {
      await assertPermission("staging.destroy.any");
    } catch {
      return { error: "Solo puedes redesplegar tus propios entornos" };
    }
  }
  try {
    await redeployStagingEnv(envId);
    revalidatePath(`/staging/${envId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function destroyStaging(envId: number): Promise<{ error?: string }> {
  const user = await assertPermission("staging.view");
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) return { error: "Entorno no encontrado" };
  // Un dev solo puede destruir SUS entornos; ADMIN/INFRA cualquiera
  if (env.requestedBy !== user.id) {
    try {
      await assertPermission("staging.destroy.any");
    } catch {
      return { error: "Solo puedes destruir tus propios entornos" };
    }
  }
  try {
    await destroyStagingEnv(envId);
    revalidatePath("/staging");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** El dev abre la PR de su rama hacia main. No puede aprobarla ni mergearla él mismo. */
export async function openStagingPr(envId: number, title: string): Promise<{ error?: string }> {
  const user = await assertPermission("pr.create");
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) return { error: "Entorno no encontrado" };
  if (env.prNumber) return { error: `Ya existe la PR #${env.prNumber}` };
  try {
    const pr = await createPullRequest({
      branch: env.branch,
      title: title.trim() || `Staging ${env.slug}: cambios de ${user.name}`,
      body: [
        `PR generada desde **TDP Gestión** por ${user.name} (${user.email}).`,
        "",
        `- Entorno staging: \`${env.slug}\` ${env.url ?? ""}`,
        `- Imagen probada: \`:${env.imageTag}\``,
        `- Rama: \`${env.branch}\``,
        "",
        "> Al aprobar y mergear, el CI del repo construye y publica la nueva imagen de producción en ghcr automáticamente.",
      ].join("\n"),
    });
    await db
      .update(schema.stagingEnvs)
      .set({ prNumber: pr.number, prUrl: pr.html_url, updatedAt: new Date() })
      .where(eq(schema.stagingEnvs.id, envId));
    await db.insert(schema.notifications).values({
      type: "pr.opened",
      title: `🔀 PR #${pr.number} abierta por ${user.name} (${env.branch})`,
      body: pr.html_url,
    });
    revalidatePath("/staging");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Merge de la PR — SOLO roles con pr.merge (ADMIN/INFRA) y NUNCA el propio
 * solicitante del entorno: separación de funciones exigida por el flujo.
 */
export async function mergeStagingPr(envId: number): Promise<{ error?: string }> {
  const user = await assertPermission("pr.merge");
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env?.prNumber) return { error: "El entorno no tiene PR" };
  if (env.requestedBy === user.id) {
    return { error: "No puedes aprobar tu propia PR — debe revisarla otra persona con permiso de merge" };
  }
  try {
    const pr = await getPullRequest(env.prNumber);
    if (pr.merged) return { error: "La PR ya está mergeada" };
    if (pr.state !== "open") return { error: `La PR está ${pr.state}` };
    await mergePullRequest(env.prNumber);
    await db.insert(schema.notifications).values({
      type: "pr.merged",
      title: `✅ PR #${env.prNumber} mergeada por ${user.name} — el CI publicará la nueva imagen de prod`,
      body: env.prUrl,
    });
    revalidatePath("/staging");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
