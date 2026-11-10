import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DraftEditor } from "@/components/drafts/draft-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DraftPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  return <DraftEditor id={id} />;
}
