import { setRequestLocale } from "next-intl/server";
import { PipelineSetup } from "@/components/admin/pipeline-setup";

export default async function AdminPipelinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PipelineSetup />;
}
