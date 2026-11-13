import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { StepPageView } from "@/components/pipelines/step/step-page";

export default async function PipelineStepPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; stepId: string }>;
}) {
  const { locale, id, stepId } = await params;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(stepId)) notFound();
  return <StepPageView id={Number(id)} stepId={Number(stepId)} />;
}
