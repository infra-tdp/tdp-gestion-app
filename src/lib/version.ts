/**
 * Versión de la app, mostrada en el pie de página.
 *
 * ⬆️ SUBE ESTE NÚMERO EN CADA CAMBIO que despliegues (SemVer: mayor.menor.parche).
 * Es la única fuente — mantenlo en sync con "version" de package.json si quieres.
 *
 * Opcional: si Coolify inyecta el commit desplegado (SOURCE_COMMIT / COMMIT_SHA),
 * el pie muestra también el SHA corto para trazar exactamente qué build corre.
 */
export const APP_VERSION = "0.5.7";

export function appCommit(): string | null {
  const sha = process.env.SOURCE_COMMIT ?? process.env.COMMIT_SHA ?? process.env.GIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}
