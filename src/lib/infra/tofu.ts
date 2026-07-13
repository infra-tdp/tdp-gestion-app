import "server-only";
import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Runner de OpenTofu contra el repo de infraestructura (tdp-tienda-infra).
 *
 * - Clona/actualiza el repo en DATA_DIR/tofu (volumen persistente del contenedor).
 * - Descubre los stacks en infra/tofu/live/<stack>.
 * - Ejecuta `tofu init` + `plan`/`apply` con el backend pg del propio repo
 *   (estado en PostgreSQL vía PG_CONN_STR) y el provider UpCloud
 *   (UPCLOUD_USERNAME / UPCLOUD_PASSWORD). El binario `tofu` viene en la imagen.
 * - El log se persiste en streaming en tofu_runs para seguirlo desde la UI.
 */

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const LIVE_DIR = "infra/tofu/live";

// Bloqueo en memoria: un solo run simultáneo por stack (una réplica de la app)
const runningStacks = new Set<string>();

function repoDir(): string {
  return path.join(DATA_DIR, "tofu", process.env.INFRA_REPO ?? "tdp-tienda-infra");
}

function cloneUrl(): string {
  const token = process.env.GITHUB_TOKEN;
  const org = process.env.GITHUB_ORG ?? "infra-tdp";
  const repo = process.env.INFRA_REPO ?? "tdp-tienda-infra";
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  return `https://x-access-token:${token}@github.com/${org}/${repo}.git`;
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; onOutput?: (chunk: string) => void },
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (data: Buffer) => {
      const text = data.toString();
      output += text;
      opts.onOutput?.(text);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

/** Clona el repo de infra si no existe; si existe, fetch + reset a origin/main. */
export async function syncInfraRepo(onOutput?: (s: string) => void): Promise<string> {
  const dir = repoDir();
  await mkdir(path.dirname(dir), { recursive: true });
  const exists = await stat(path.join(dir, ".git")).then(() => true).catch(() => false);
  if (!exists) {
    onOutput?.(`[git] clonando ${process.env.INFRA_REPO ?? "tdp-tienda-infra"}…\n`);
    const res = await run("git", ["clone", "--depth", "1", cloneUrl(), dir], { onOutput });
    if (res.code !== 0) throw new Error("git clone falló:\n" + res.output.slice(-500));
  } else {
    onOutput?.("[git] actualizando repo de infra…\n");
    await run("git", ["-C", dir, "fetch", "--depth", "1", "origin", "main"], { onOutput });
    const res = await run("git", ["-C", dir, "reset", "--hard", "origin/main"], { onOutput });
    if (res.code !== 0) throw new Error("git reset falló:\n" + res.output.slice(-500));
  }
  const sha = await run("git", ["-C", dir, "rev-parse", "HEAD"], {});
  return sha.output.trim();
}

/** Stacks disponibles (directorios en infra/tofu/live). */
export async function listStacks(): Promise<string[]> {
  try {
    const dir = path.join(repoDir(), LIVE_DIR);
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    // Repo aún no clonado: stacks conocidos del repo de infra
    return ["prod", "coolify", "coolify-prod"];
  }
}

/** Sanea el nombre de stack (viene de la UI). */
function safeStack(stack: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(stack)) throw new Error("Nombre de stack inválido");
  return stack;
}

export function tofuConfigured(): boolean {
  return Boolean(process.env.PG_CONN_STR && process.env.GITHUB_TOKEN);
}

/**
 * Encola y ejecuta un run de tofu. Devuelve el id del run inmediatamente;
 * la ejecución sigue en background actualizando el log en BD.
 */
export async function startTofuRun(params: {
  stack: string;
  action: "plan" | "apply";
  userId: number;
}): Promise<number> {
  const stack = safeStack(params.stack);
  if (runningStacks.has(stack)) {
    throw new Error(`Ya hay una ejecución en curso sobre el stack "${stack}"`);
  }

  const [row] = await db
    .insert(schema.tofuRuns)
    .values({ stack, action: params.action, triggeredBy: params.userId, status: "queued" })
    .returning({ id: schema.tofuRuns.id });

  runningStacks.add(stack);
  void executeRun(row.id, stack, params.action).finally(() => runningStacks.delete(stack));
  return row.id;
}

async function appendLog(runId: number, chunk: string): Promise<void> {
  await db
    .update(schema.tofuRuns)
    .set({ log: sql`${schema.tofuRuns.log} || ${chunk}` })
    .where(eq(schema.tofuRuns.id, runId));
}

async function executeRun(runId: number, stack: string, action: "plan" | "apply"): Promise<void> {
  // Buffer de log con flush periódico para no castigar la BD
  let buffer = "";
  const flush = async () => {
    if (!buffer) return;
    const chunk = buffer;
    buffer = "";
    await appendLog(runId, chunk).catch(() => {});
  };
  const timer = setInterval(flush, 1200);
  const onOutput = (s: string) => {
    buffer += s;
  };

  try {
    await db
      .update(schema.tofuRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(schema.tofuRuns.id, runId));

    const sha = await syncInfraRepo(onOutput);
    await db.update(schema.tofuRuns).set({ gitSha: sha }).where(eq(schema.tofuRuns.id, runId));

    const stackDir = path.join(repoDir(), LIVE_DIR, stack);
    const env: Record<string, string | undefined> = {
      PG_CONN_STR: process.env.PG_CONN_STR,
      UPCLOUD_USERNAME: process.env.UPCLOUD_USERNAME,
      UPCLOUD_PASSWORD: process.env.UPCLOUD_PASSWORD,
      TF_IN_AUTOMATION: "1",
    };

    onOutput(`\n[tofu] init (${stack})…\n`);
    const init = await run("tofu", ["init", "-input=false", "-no-color"], { cwd: stackDir, env, onOutput });
    if (init.code !== 0) throw new Error(`tofu init salió con código ${init.code}`);

    const args =
      action === "plan"
        ? ["plan", "-input=false", "-no-color"]
        : ["apply", "-input=false", "-no-color", "-auto-approve"];
    onOutput(`\n[tofu] ${action} (${stack})…\n`);
    const result = await run("tofu", args, { cwd: stackDir, env, onOutput });

    await flush();
    await db
      .update(schema.tofuRuns)
      .set({
        status: result.code === 0 ? "success" : "error",
        exitCode: result.code,
        finishedAt: new Date(),
      })
      .where(eq(schema.tofuRuns.id, runId));
  } catch (err) {
    onOutput(`\n[error] ${err instanceof Error ? err.message : String(err)}\n`);
    await flush();
    await db
      .update(schema.tofuRuns)
      .set({ status: "error", finishedAt: new Date() })
      .where(eq(schema.tofuRuns.id, runId));
  } finally {
    clearInterval(timer);
    await flush();
  }
}
