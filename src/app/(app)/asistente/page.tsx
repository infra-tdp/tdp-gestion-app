import { requirePermission } from "@/lib/auth/rbac";
import { aiConfigured } from "@/lib/ai/assistant";
import { EmptyState, PageHeader } from "@/components/ui";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asistente IA" };

export default async function AssistantPage() {
  await requirePermission("ai.use");
  return (
    <>
      <PageHeader eyebrow="Pregúntale al panel" title="Asistente IA" />
      {!aiConfigured() ? (
        <EmptyState
          title="Asistente sin configurar"
          detail="Añade ANTHROPIC_API_KEY a las variables de entorno en Coolify para activarlo."
        />
      ) : (
        <Chat />
      )}
    </>
  );
}
