import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen de runtime mínima para Coolify: node server.js (sin node_modules completos)
  output: "standalone",
  // Solo-servidor + necesarios como paquetes reales en el standalone: pg y
  // drizzle-orm los usa también scripts/migrate.mjs (import por especificador),
  // que no pasa por el bundler de Next, así que deben quedar en node_modules.
  serverExternalPackages: ["pg", "drizzle-orm"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
