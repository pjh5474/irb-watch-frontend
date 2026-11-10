import { setRequestLocale } from "next-intl/server";
import { DraftList } from "@/components/drafts/draft-list";

export default async function DraftsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DraftList />;
}
