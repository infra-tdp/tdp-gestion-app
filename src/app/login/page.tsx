import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isGoogleConfigured } from "@/lib/auth/google";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

const GOOGLE_ERRORS: Record<string, string> = {
  nolink:
    "Tu cuenta aún no tiene Google vinculado: entra con tu contraseña y actívalo en Ajustes → Seguridad.",
  email: "La cuenta de Google no coincide con tu correo del panel.",
  config: "El acceso con Google no está configurado.",
  unverified: "Tu correo de Google no está verificado.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { google_error: googleError } = await searchParams;
  const googleEnabled = isGoogleConfigured();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size={44} />
          <p className="text-muted text-sm mt-3">Panel interno de Taller del Patinete</p>
        </div>
        <div className="tdp-card p-6">
          <LoginForm />
          {googleEnabled && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-[color:var(--border,#e5e5e5)]" />
                <span className="text-muted text-[11px] uppercase tracking-wider">o</span>
                <div className="h-px flex-1 bg-[color:var(--border,#e5e5e5)]" />
              </div>
              <a
                href="/api/auth/google/start?mode=login"
                className="btn-outline w-full justify-center inline-flex"
              >
                Continuar con Google
              </a>
            </>
          )}
          {googleError && (
            <p className="text-danger text-sm font-semibold mt-3">
              {GOOGLE_ERRORS[googleError] ?? "No se pudo completar el acceso con Google."}
            </p>
          )}
        </div>
        <p className="text-muted text-[11px] text-center mt-6">
          Acceso restringido · Central, tiendas y equipo de desarrollo
        </p>
      </div>
    </main>
  );
}
