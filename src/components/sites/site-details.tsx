"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorText } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { type FactEntry, type SiteFact, siteApi } from "@/lib/api/sites";
import { todaySeoul } from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

export const siteFactsKey = (siteId: number) => ["sites", "facts", siteId] as const;
const START_DATE = "1900-01-01"; // the PI a site was created with: "from the start"

/**
 * A site's details (phase B2a): PI, site number and free details (CRA, CRC, ...) with a dated
 * history. Nothing is ever overwritten: a change is a new entry from a day on; a typo is fixed
 * with "Correct", which adds an entry that replaces that one. The current value is the newest
 * entry dated today or earlier; later ones show as upcoming.
 */
export function SiteDetails({
  siteId,
  readOnly,
  steps = [],
}: {
  siteId: number;
  readOnly: boolean;
  steps?: { id: number; name: string }[]; // the site's steps, to say which one reported a change
}) {
  const t = useTranslations("sites");
  const tp = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const facts = useQuery({ queryKey: siteFactsKey(siteId), queryFn: () => siteApi.facts(siteId) });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null); // the detail whose history is shown
  const [form, setForm] = useState({ name: "", value: "", from: todaySeoul(), step: "", corrects: null as FactEntry | null });
  const [pi, setPi] = useState({ name: "", from: todaySeoul(), editing: false });
  const [siteNo, setSiteNo] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, ok: string, after?: () => void) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        after?.();
        await queryClient.invalidateQueries({ queryKey: siteFactsKey(siteId) });
        await queryClient.invalidateQueries({ queryKey: ["sites"] });
        await queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, tp) });
      }
    });
  }

  if (facts.isLoading) return <p className="text-sm opacity-70">{tp("loading")}</p>;
  if (facts.isError || !facts.data)
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorText(facts.error, tp)}
      </p>
    );
  const { site, suggested } = facts.data;
  const details = facts.data.facts.filter((f) => f.name !== "PI");
  const piHistory = facts.data.facts.find((f) => f.name === "PI");
  const stepName = new Map(steps.map((s) => [s.id, s.name]));
  // The PI before the current one (the next older entry that was not corrected).
  const piRows = (piHistory?.history ?? []).filter((e) => !e.corrected);
  const piAt = piHistory?.current ? piRows.findIndex((e) => e.id === piHistory.current?.id) : -1;
  const piBefore = piAt >= 0 ? piRows[piAt + 1] : undefined;
  const fromText = (d: string) => (d === START_DATE ? t("fromStart") : t("from", { date: d }));

  function entryLine(e: FactEntry) {
    return [
      e.value || t("removedValue"),
      fromText(e.valid_from),
      e.changed_by ? t("by", { name: e.changed_by }) : null,
      e.step_id !== null && stepName.has(e.step_id) ? t("inStep", { step: stepName.get(e.step_id) ?? "" }) : null,
      e.corrects !== null ? t("correction") : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function startCorrection(f: SiteFact, entry: FactEntry) {
    setForm({ name: f.name, value: entry.value, from: entry.valid_from, step: "", corrects: entry });
  }

  return (
    <section className="flex flex-col gap-3 text-sm" aria-label={t("title")}>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="opacity-70">{t("pi")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span>{site.pi_name || t("noPi")}</span>
          {!readOnly && !pi.editing && (
            <Button size="sm" variant="ghost" onClick={() => setPi({ name: site.pi_name, from: todaySeoul(), editing: true })}>
              {t("changePi")}
            </Button>
          )}
          {piBefore && piHistory?.current && (
            <span className="text-xs opacity-60">
              {t("piBefore", { name: piBefore.value || t("noPi"), date: piHistory.current.valid_from })}
            </span>
          )}
          {piHistory?.upcoming.map((u) => (
            <span key={u.id} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {t("upcoming", { value: u.value || t("noPi"), date: u.valid_from })}
            </span>
          ))}
        </dd>
        <dt className="opacity-70">{t("siteNo")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {siteNo === null ? (
            <>
              <span>{site.site_no || "-"}</span>
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={() => setSiteNo(site.site_no)}>
                  {t("edit")}
                </Button>
              )}
            </>
          ) : (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => siteApi.update(siteId, { site_no: siteNo }), t("saved"), () => setSiteNo(null));
              }}
            >
              <input aria-label={t("siteNo")} className="w-24 rounded border px-2 py-0.5" maxLength={20} value={siteNo} onChange={(e) => setSiteNo(e.target.value)} />
              <Button size="sm" type="submit" disabled={flight.busy}>
                {t("save")}
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setSiteNo(null)}>
                {tp("cancel")}
              </Button>
            </form>
          )}
        </dd>
      </dl>

      {pi.editing && (
        <form
          className="flex flex-wrap items-end gap-2 rounded bg-neutral-50 p-2 dark:bg-neutral-900"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => siteApi.changePi(siteId, { pi_name: pi.name, valid_from: pi.from }), t("piChanged"), () =>
              setPi((p) => ({ ...p, editing: false })),
            );
          }}
        >
          <label className="flex flex-col gap-1">
            {t("newPi")}
            <input className="rounded border px-2 py-1" maxLength={100} value={pi.name} onChange={(e) => setPi({ ...pi, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t("fromDate")}
            <input type="date" className="rounded border px-2 py-1" value={pi.from} onChange={(e) => setPi({ ...pi, from: e.target.value })} />
          </label>
          <Button size="sm" type="submit" disabled={flight.busy}>
            {t("save")}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setPi({ ...pi, editing: false })}>
            {tp("cancel")}
          </Button>
          <p className="basis-full text-xs opacity-70">{t("piHint")}</p>
        </form>
      )}

      <h3 className="font-medium">{t("details")}</h3>
      {details.length === 0 && <p className="opacity-70">{t("noDetails")}</p>}
      <ul className="flex flex-col gap-2">
        {details.map((f) => (
          <li key={f.name} className="flex flex-col gap-1 rounded border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{f.name}</span>
              <span>{f.current?.value ? f.current.value : <span className="opacity-60">{t("notSet")}</span>}</span>
              {f.current && <span className="text-xs opacity-60">{fromText(f.current.valid_from)}</span>}
              {f.upcoming.map((u) => (
                <span key={u.id} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                  {t("upcoming", { value: u.value || t("removedValue"), date: u.valid_from })}
                </span>
              ))}
              <span className="ml-auto flex gap-1">
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => setForm({ name: f.name, value: "", from: todaySeoul(), step: "", corrects: null })}>
                    {t("change")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" aria-expanded={open === f.name} onClick={() => setOpen(open === f.name ? null : f.name)}>
                  {t("history")}
                </Button>
              </span>
            </div>
            {open === f.name && (
              <ol className="ml-2 flex flex-col gap-1 text-xs">
                {f.history.map((e) => (
                  <li key={e.id} className={`flex flex-wrap items-center gap-2 ${e.corrected ? "line-through opacity-50" : ""}`}>
                    <span>{entryLine(e)}</span>
                    {!readOnly && !e.corrected && (
                      <Button size="sm" variant="ghost" onClick={() => startCorrection(f, e)}>
                        {t("correct")}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <form
          aria-label={t("formTitle")}
          className="flex flex-wrap items-end gap-2 rounded bg-neutral-50 p-2 dark:bg-neutral-900"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return setMessage({ kind: "error", text: t("needName") });
            void run(
              () =>
                siteApi.addFact(siteId, {
                  name: form.name,
                  value: form.value,
                  valid_from: form.from || null,
                  step_id: form.step ? Number(form.step) : null,
                  corrects: form.corrects?.id ?? null,
                }),
              form.corrects ? t("corrected") : t("saved"),
              () => setForm({ name: "", value: "", from: todaySeoul(), step: "", corrects: null }),
            );
          }}
        >
          {form.corrects && <p className="basis-full text-xs text-amber-800">{t("correcting", { value: form.corrects.value || t("removedValue") })}</p>}
          <label className="flex flex-col gap-1">
            {t("name")}
            <input
              className="rounded border px-2 py-1"
              list={`site-${siteId}-names`}
              maxLength={100}
              value={form.name}
              disabled={!!form.corrects}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <datalist id={`site-${siteId}-names`}>
              {suggested.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            {t("value")}
            <input className="rounded border px-2 py-1" maxLength={2000} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t("fromDate")}
            <input type="date" className="rounded border px-2 py-1" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </label>
          {steps.length > 0 && (
            <label className="flex flex-col gap-1">
              {t("reportedIn")}
              <select className="rounded border px-2 py-1" value={form.step} onChange={(e) => setForm({ ...form, step: e.target.value })}>
                <option value="">{t("noStep")}</option>
                {steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" type="submit" disabled={flight.busy}>
            {form.corrects ? t("saveCorrection") : t("save")}
          </Button>
          {form.corrects && (
            <Button size="sm" type="button" variant="ghost" onClick={() => setForm({ name: "", value: "", from: todaySeoul(), step: "", corrects: null })}>
              {tp("cancel")}
            </Button>
          )}
          <p className="basis-full text-xs opacity-70">{t("formHint")}</p>
        </form>
      )}

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
