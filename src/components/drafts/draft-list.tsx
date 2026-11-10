"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { docgenApi } from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

const KEY = ["docgen", "drafts"] as const;

export function DraftList() {
  const t = useTranslations("drafts");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const drafts = useQuery({ queryKey: KEY, queryFn: docgenApi.list });
  const status = useQuery({ queryKey: ["docgen", "status"], queryFn: docgenApi.status });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function remove(id: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await docgenApi.remove(id);
        setConfirming(null);
        setMessage({ kind: "ok", text: t("deleted") });
        await queryClient.invalidateQueries({ queryKey: KEY });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Section
        icon={FileText}
        accent="blue"
        level={1}
        title={t("title")}
        aside={
          <Link href="/drafts/new" className={`ml-auto ${buttonVariants({ size: "sm" })}`}>
            {t("new")}
          </Link>
        }
      >
        <p className="text-sm opacity-80">{t("intro")}</p>
        {status.data && (
          <p className="text-xs opacity-70">
            {status.data.enabled
              ? t("usage", { used: status.data.used, limit: status.data.limit })
              : t("off", { reason: status.data.reason ?? "" })}
          </p>
        )}
        {drafts.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {drafts.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(drafts.error, t)}
          </p>
        )}
        {drafts.data?.length === 0 && <p className="text-sm opacity-70">{t("empty")}</p>}
        <ul className="flex flex-col divide-y">
          {drafts.data?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link href={`/drafts/${d.id}`} className="min-w-48 flex-1 font-medium underline-offset-4 hover:underline">
                {d.title || t("editorTitle")}
              </Link>
              <span className="text-xs opacity-60">
                {t("documentsCount", { n: d.documents.length })} ·{" "}
                {t("updated", { date: format.dateTime(new Date(d.updated_at), { dateStyle: "medium", timeStyle: "short" }) })}
              </span>
              {confirming === d.id ? (
                <span className="flex items-center gap-2 text-sm">
                  {t("confirmDelete")}
                  <Button size="sm" variant="destructive" disabled={flight.busy} onClick={() => remove(d.id)}>
                    {t("confirm")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    {t("cancel")}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(d.id)}>
                  {t("delete")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
          >
            {message.text}
          </p>
        )}
      </Section>
    </main>
  );
}
