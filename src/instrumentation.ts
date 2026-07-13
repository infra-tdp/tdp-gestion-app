/**
 * Hook de instrumentación de Next.js. La lógica real vive en
 * instrumentation-node.ts — el import va DENTRO del branch positivo para que
 * el bundle edge lo elimine por dead-code elimination (pg usa builtins de node).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./instrumentation-node");
    await startup();
  }
}
