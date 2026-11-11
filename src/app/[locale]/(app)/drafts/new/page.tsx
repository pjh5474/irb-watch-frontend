import { setRequestLocale } from "next-intl/server";
import type { InitialDoc } from "@/components/drafts/document-picker";
import { NewDraft } from "@/components/drafts/new-draft";
import { createClient } from "@/lib/supabase/server";

// ?document=12&v=3 comes from "Draft a form from this" on a document page. The document is read
// here under the user's own login (row-level security): one the user may not read is ignored.
export default async function NewDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ document?: string; v?: string }>;
}) {
  const { locale } = await params;
  const { document, v } = await searchParams;
  setRequestLocale(locale);

  let initial: InitialDoc | null = null;
  if (document && /^\d+$/.test(document)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("documents")
      .select("id, title, source_id")
      .eq("id", Number(document))
      .maybeSingle();
    if (data) {
      initial = { ...data, version_no: v && /^\d+$/.test(v) ? Number(v) : null };
    }
  }
  return <NewDraft initial={initial} />;
}
