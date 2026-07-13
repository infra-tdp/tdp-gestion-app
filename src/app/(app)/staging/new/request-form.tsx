"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestStaging } from "@/lib/actions/staging";

export function StagingRequestForm({ tags, hasSshKey }: { tags: string[]; hasSshKey: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      action={(fd) =>
        startTransition(async () => {
          const res = await requestStaging(fd);
          if (res.error) setError(res.error);
          else if (res.id) router.push(`/staging/${res.id}`);
        })
      }
    >
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Versión de la imagen (ghcr)
        </label>
        {tags.length > 0 ? (
          <select name="imageTag" className="tdp-input" defaultValue="latest">
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <input name="imageTag" className="tdp-input" defaultValue="latest" placeholder="latest" />
        )}
        <p className="text-muted text-[12px] mt-1.5">
          Por defecto <code className="text-primary">latest</code> — la última imagen publicada por el CI.
        </p>
      </div>

      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Duración (horas)
        </label>
        <select name="ttlHours" className="tdp-input" defaultValue="72">
          <option value="8">8 h — prueba rápida</option>
          <option value="24">24 h</option>
          <option value="72">72 h — por defecto</option>
          <option value="168">1 semana</option>
        </select>
        <p className="text-muted text-[12px] mt-1.5">Al caducar, el entorno se destruye solo (la rama se conserva si tiene PR).</p>
      </div>

      {!hasSshKey && (
        <p className="text-warning text-sm font-semibold">
          ⚠ No tienes claves SSH guardadas — podrás desplegar, pero no entrar al devbox.{" "}
          <Link href="/settings/ssh-keys" className="text-primary underline">
            Añade tu clave primero
          </Link>
          .
        </p>
      )}

      {error && <p className="text-danger text-sm font-semibold">{error}</p>}

      <button type="submit" className="btn-primary uppercase" disabled={pending}>
        {pending ? "Creando…" : "Crear entorno"}
      </button>
    </form>
  );
}
