import type { Metadata } from "next";
import { barlow, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TDP Gestión", template: "%s · TDP Gestión" },
  description: "CRM interno de Taller del Patinete — infraestructura, tiendas, ventas y stock.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${barlow.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
