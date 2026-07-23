import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen de runtime mínima para Coolify: node server.js (sin node_modules completos)
  output: "standalone",
  // Solo-servidor + necesarios como paquetes reales en el standalone: pg y
  // drizzle-orm los usa también scripts/migrate.mjs (import por especificador),
  // que no pasa por el bundler de Next, así que deben quedar en node_modules.
  serverExternalPackages: ["pg", "drizzle-orm"],
  eslint: { ignoreDuringBuilds: true },
  // TIEMPO REAL: TDP Gestión son configuraciones, parámetros, gráficas y números
  // en vivo, nada debe servirse cacheado. El middleware ya pone `no-store` en las
  // respuestas (navegador/Cloudflare). Aquí anulamos además el Router Cache de
  // CLIENTE de Next: sin esto, al navegar entre secciones el cliente reutiliza el
  // RSC prefetcheado (hasta 5 min en segmentos estáticos) y verías datos viejos.
  // Con 0/0 cada navegación revalida contra el servidor.
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
