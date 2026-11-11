import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PipelineView } from "@/components/pipelines/pipeline-view";

export default async function PipelinePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  return <PipelineView id={Number(id)} />;
}
