import { setRequestLocale } from "next-intl/server";
import { AgentSettings } from "@/components/admin/agent-settings";

export default async function AdminAssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AgentSettings />;
}
