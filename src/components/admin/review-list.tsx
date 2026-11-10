"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SOURCES_KEY } from "@/components/admin/admin-sources";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

export const REVIEWS_KEY = ["admin", "reviews"] as const;

type Message = { kind: "ok" | "error"; text: string } | null;

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
    >
      {message.text}
    </p>
  );
}

/** "OK, reviewed" for one document's file warnings (document page, admins only). The server
 * refuses a post that failed to load and says why; that reason is shown. */
export function ReviewOkButton({ documentId }: { documentId: number }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);

  async function ok() {
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.reviewOk(documentId);
        setMessage({ kind: "ok", text: t("reviews.done") });
        router.refresh();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={ok} disabled={flight.busy} aria-busy={flight.busy}>
        {flight.busy && <Spinner aria-hidden />}
        {t("reviews.ok")}
      </Button>
      <span className="text-xs opacity-70">{t("reviews.okHint")}</span>
      <Note message={message} />
    </div>
  );
}

/** Every document in "needs review", across sources, with OK buttons for file warnings. */
export function ReviewList() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const reviews = useQuery({ queryKey: REVIEWS_KEY, queryFn: adminApi.reviews });
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);

  async function ok(documentId: number, title: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.reviewOk(documentId);
        setMessage({ kind: "ok", text: t("reviews.doneNamed", { title }) });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await queryClient.invalidateQueries({ queryKey: REVIEWS_KEY });
      // The server may have turned the source's light green too.
      await queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
    });
  }

  const items = reviews.data ?? [];
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <Section icon={TriangleAlert} accent="amber" level={1} title={t("reviews.title")}>
        <p className="text-sm opacity-80">{t("reviews.intro")}</p>
      </Section>
      <Note message={message} />
      {reviews.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {reviews.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(reviews.error, t)}
        </p>
      )}
      {reviews.data && items.length === 0 && <p className="text-sm opacity-70">{t("reviews.empty")}</p>}
      {items.length > 0 && <p className="text-xs opacity-70">{t("reviews.count", { n: items.length })}</p>}
      <ul className="flex flex-col divide-y rounded border">
        {items.map((item) => (
          <li key={item.document_id} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs opacity-60">{item.source_name}</span>
              <Link href={`/documents/${item.document_id}`} className="font-medium underline-offset-4 hover:underline">
                {item.title}
              </Link>
            </div>
            <p className="text-xs break-words text-amber-800 dark:text-amber-200">{item.review_reason}</p>
            {item.file_warning ? (
              <div>
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => ok(item.document_id, item.title)}>
                  {t("reviews.ok")}
                </Button>
              </div>
            ) : (
              <p className="text-xs opacity-70">{t("reviews.failedPost")}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
