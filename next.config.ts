import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen de runtime mínima para Coolify: node server.js (sin node_modules completos)
  output: "standalone",
  // El runner de tofu y los clientes de infraestructura son solo-servidor
  serverExternalPackages: ["pg"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
