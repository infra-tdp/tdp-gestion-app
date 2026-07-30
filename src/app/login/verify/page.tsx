import { redirect } from "next/navigation";
import { getPendingChallengeInfo } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificación en dos pasos" };

export default async function VerifyPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const info = await getPendingChallengeInfo();
  if (!info) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size={44} />
          <p className="text-muted text-sm mt-3">Verificación en dos pasos</p>
        </div>
        <div className="tdp-card p-6">
          <p className="text-sm mb-4">
            {info.method === "EMAIL"
              ? `Te hemos enviado una clave temporal de 6 dígitos a ${info.maskedEmail ?? "tu correo"}.`
              : "Introduce el código de 6 dígitos de tu app de autenticación (Google Authenticator)."}
          </p>
          <VerifyForm method={info.method} />
        </div>
        <p className="text-muted text-[11px] text-center mt-6">
          La clave caduca a los 10 minutos · Puedes volver a{" "}
          <a href="/login" className="underline">
            iniciar sesión
          </a>
        </p>
      </div>
    </main>
  );
}
