"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Note, errorText, useChange } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type CopyTarget, pipelineApi } from "@/lib/api/pipelines";
import { siteLabel } from "@/lib/api/sites";

/**
 * "Copy to other PIs" (phase C2): copies a main step to the other sites of its hospital in the
 * project. Closed until asked for, so the step page makes no extra call; the preview says per
 * site what happens (add, fill the untouched step, or skip with the reason). The server plans
 * again on Copy, all or nothing.
 */
export function StepCopy({ pipelineId, stepId }: { pipelineId: number; stepId: number }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [open, setOpen] = useState(false);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<CopyTarget[] | null>(null);
  const targets = useQuery({
    queryKey: ["pipelines", "copy-targets", pipelineId, stepId],
    queryFn: () => pipelineApi.copyTargets(pipelineId, stepId),
    enabled: open,
  });

  const rows = targets.data ?? [];
  const chosen = rows.filter((r) => r.action !== "skip" && !unticked.has(r.site_id)).map((r) => r.site_id);
  const name = (r: CopyTarget) => siteLabel(r) || t("copy.unnamed");

  function toggle(siteId: number) {
    setUnticked((old) => {
      const next = new Set(old);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }

  async function copy() {
    if (chosen.length === 0) return change.setMessage({ kind: "error", text: t("copy.pick") });
    setResult(null);
    let done: CopyTarget[] = [];
    const ok = await change.run(async () => {
      done = await pipelineApi.copyStep(pipelineId, stepId, chosen);
    }, null);
    if (ok) {
      setResult(done);
      setUnticked(new Set());
      const copied = done.filter((r) => r.action !== "skip").length;
      change.setMessage({ kind: "ok", text: t("copy.done", { count: copied }) });
    }
  }

  function what(r: CopyTarget): string {
    if (r.action === "add") return t("copy.add", { step: r.step_label });
    if (r.action === "fill") return t("copy.fill", { step: r.step_label });
    return t(`copy.reason.${r.reason ?? "has_work"}`, { step: r.step_label });
  }

  if (!open)
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("copy.open")}
        </Button>
      </div>
    );

  return (
    <section className="flex flex-col gap-2 rounded border p-4 text-sm" aria-labelledby={`copy-${stepId}`}>
      <h2 id={`copy-${stepId}`} className="font-medium">
        {t("copy.title")}
      </h2>
      <p className="opacity-70">{t("copy.explain")}</p>
      {targets.isLoading && <p className="opacity-70">{t("loading")}</p>}
      {targets.isError && (
        <p role="alert" className="text-red-600">
          {errorText(targets.error, t)}
        </p>
      )}
      {targets.isSuccess && rows.length === 0 && <p className="opacity-70">{t("copy.none")}</p>}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.site_id}>
              <label className={`flex flex-wrap items-center gap-2 ${r.action === "skip" ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  disabled={r.action === "skip" || change.busy}
                  checked={r.action !== "skip" && !unticked.has(r.site_id)}
                  onChange={() => toggle(r.site_id)}
                />
                <span className="font-medium">{name(r)}</span>
                <span>— {what(r)}</span>
                {r.notes.includes("meeting_not_copied") && (
                  <span className="text-amber-700 dark:text-amber-300">({t("copy.meetingNotCopied")})</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={change.busy || chosen.length === 0} onClick={copy}>
          {t("copy.submit", { count: chosen.length })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
      <Note message={change.message} />
      {result && (
        <ul className="flex flex-col gap-1" aria-label={t("copy.resultTitle")}>
          {result.map((r) => (
            <li key={r.site_id}>
              <span className="font-medium">{name(r)}</span>{" "}
              {r.action === "skip" || r.pipeline_id === null || r.step_id === null ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {t("copy.skipped")}: {what(r)}
                </span>
              ) : (
                <Link href={`/pipelines/${r.pipeline_id}/steps/${r.step_id}`} className="underline underline-offset-4">
                  {r.action === "add" ? t("copy.added", { step: r.step_label }) : t("copy.filled", { step: r.step_label })}
                </Link>
              )}
              {r.notes.includes("meeting_not_copied") && (
                <span className="text-amber-700 dark:text-amber-300"> ({t("copy.meetingNotCopied")})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
