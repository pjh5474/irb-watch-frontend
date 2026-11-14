import { getTranslations } from "next-intl/server";
import { docgenEnabled } from "@/lib/features";

// Wraps every docs-generator page (drafts, admin guides, admin forms). With the switch off an old
// link shows why the page is gone instead of breaking or looking empty.
export async function DocgenGate({ children }: { children: React.ReactNode }) {
  if (docgenEnabled()) return <>{children}</>;
  const t = await getTranslations("drafts");
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p role="status" className="rounded border px-4 py-3 text-sm">
        {t("off")}
      </p>
    </main>
  );
}
