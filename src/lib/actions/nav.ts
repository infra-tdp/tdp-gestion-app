"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/rbac";
import { resetNavOverrides, saveNavOverrides, type NavOverrides } from "@/lib/nav";

/** Persiste la personalización del menú (nombres + orden), saneada. */
export async function saveNav(ov: NavOverrides): Promise<{ error?: string }> {
  await assertPermission("nav.manage");
  const labels: Record<string, string> = {};
  for (const [id, label] of Object.entries(ov.labels ?? {})) {
    const v = String(label).trim().slice(0, 60);
    if (v) labels[id] = v;
  }
  const order: Record<string, string[]> = {};
  for (const [parent, ids] of Object.entries(ov.order ?? {})) {
    if (Array.isArray(ids)) order[parent] = ids.map(String).slice(0, 100);
  }
  await saveNavOverrides({ labels, order });
  revalidatePath("/", "layout");
  return {};
}

/** Vuelve al menú por defecto (borra nombres y orden personalizados). */
export async function resetNav(): Promise<void> {
  await assertPermission("nav.manage");
  await resetNavOverrides();
  revalidatePath("/", "layout");
}
