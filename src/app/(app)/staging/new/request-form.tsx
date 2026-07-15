"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestStaging } from "@/lib/actions/staging";

export function StagingRequestForm({
  tags,
  backups,
  backupError,
  hasSshKey,
}: {
  tags: string[];
  backups: { key: string; label: string }[];
  backupError?: string | null;
  hasSshKey: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"build" | "image">("build");
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
          Origen del código
        </label>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="source"
              value="build"
              className="tdp-check mt-0.5"
              checked={source === "build"}
              onChange={() => setSource("build")}
            />
            <span>
              <b>Construir desde la rama</b> — copia main y compila con el <code>Dockerfile</code> del repo.
              <span className="block text-muted text-[12px]">Ves tu código tal cual; ideal para desarrollar.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="source"
              value="image"
              className="tdp-check mt-0.5"
              checked={source === "image"}
              onChange={() => setSource("image")}
            />
            <span>
              <b>Imagen ghcr</b> — una versión ya publicada.
              <span className="block text-muted text-[12px]">Para probar un release contra datos de prod.</span>
            </span>
          </label>
        </div>
      </div>

      {source === "image" && (
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
        </div>
      )}

      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Backup de la BD a restaurar
        </label>
        <select name="backupKey" className="tdp-input" defaultValue="" disabled={backups.length === 0 && !!backupError}>
          <option value="">El más reciente (recomendado)</option>
          {backups.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        {backupError ? (
          <p className="text-warning text-[12px] mt-1.5 flex gap-1.5">
            <span aria-hidden>⚠</span>
            <span>{backupError}</span>
          </p>
        ) : (
          <p className="text-muted text-[12px] mt-1.5">
            Se restaura en un MySQL temporal del entorno. Producción no se toca.
          </p>
        )}
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
