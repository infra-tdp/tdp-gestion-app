import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size={44} />
          <p className="text-muted text-sm mt-3">Panel interno de Taller del Patinete</p>
        </div>
        <div className="tdp-card p-6">
          <LoginForm />
        </div>
        <p className="text-muted text-[11px] text-center mt-6">
          Acceso restringido · Central, tiendas y equipo de desarrollo
        </p>
      </div>
    </main>
  );
}
