import type { Metadata } from "next";
import { barlow, inter } from "@/lib/fonts";
import { indexingAllowed } from "@/lib/seo";
import "./globals.css";

/**
 * Se usa generateMetadata (y no un `metadata` constante) para que ALLOW_INDEXING
 * se lea EN CADA PETICIÓN: una constante se evaluaría al construir la imagen,
 * cuando la variable de entorno del contenedor todavía no existe.
 */
export function generateMetadata(): Metadata {
  return {
    title: { default: "TDP Gestión", template: "%s · TDP Gestión" },
    description: "CRM interno de Taller del Patinete — infraestructura, tiendas, ventas y stock.",
    // Panel interno: fuera de los buscadores salvo que se pida lo contrario.
    robots: indexingAllowed()
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${barlow.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
