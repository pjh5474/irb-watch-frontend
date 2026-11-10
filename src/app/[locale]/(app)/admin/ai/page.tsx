import { setRequestLocale } from "next-intl/server";
import { AiInstructions } from "@/components/admin/ai-instructions";

export default async function AdminAiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AiInstructions />;
}
