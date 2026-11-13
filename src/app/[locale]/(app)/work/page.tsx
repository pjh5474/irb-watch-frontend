import { setRequestLocale } from "next-intl/server";
import { WorkView } from "@/components/work/work-view";

export default async function WorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <WorkView />;
}
