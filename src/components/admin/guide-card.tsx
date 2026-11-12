"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AdminHospital } from "@/lib/api/admin";
import { docgenApi, guideFileProblem, toUpload, type Guide } from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

// One guide in the library: what it applies to, and the admin's tools for it (view the text,
// choose its hospitals, make it global, rename, replace the file, see earlier texts, archive).
// Guides are linked to hospitals (2026-11-12): a hospital's guide applies to all its boards.

export type GuideFilter = { text: string; scope: "all" | "global" | "unlinked" | `hospital:${number}` };

/** Guides matching the name search and the scope filter. */
export function filterGuides(guides: Guide[], filter: GuideFilter): Guide[] {
  const q = filter.text.trim().toLowerCase();
  return guides.filter((g) => {
    if (q && !g.title.toLowerCase().includes(q) && !g.filename.toLowerCase().includes(q)) return false;
    if (filter.scope === "global") return !!g.is_global;
    if (filter.scope === "unlinked") return !g.is_global && g.hospital_ids.length === 0;
    if (filter.scope.startsWith("hospital:")) {
      const id = Number(filter.scope.slice(9));
      return !!g.is_global || g.hospital_ids.includes(id);
    }
    return true;
  });
}

type Mode = null | "text" | "sites" | "rename" | "replace" | "history" | "archive";
type Message = { kind: "ok" | "error"; text: string } | null;

export function GuideCard({
  guide,
  hospitals,
  names,
  onChanged,
}: {
  guide: Guide;
  hospitals: AdminHospital[];
  names: Map<number, string>;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const flight = useSingleFlight();
  const [mode, setMode] = useState<Mode>(null);
  const [message, setMessage] = useState<Message>(null);
  const archived = !!guide.archived_at;

  async function run(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await action();
        setMode(null);
        setMessage({ kind: "ok", text: done });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const toggle = (m: Mode) => {
    setMessage(null);
    setMode(mode === m ? null : m);
  };
  const tool = (m: Mode, label: string, disabled = false) => (
    <Button size="sm" variant={mode === m ? "default" : "ghost"} disabled={disabled || flight.busy} onClick={() => toggle(m)} aria-expanded={mode === m}>
      {label}
    </Button>
  );

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-words">{guide.title}</span>
        {guide.is_global && <Badge>{t("guides.global")}</Badge>}
        {archived && <Badge>{t("guides.archived")}</Badge>}
        <span className="opacity-60 break-all">{guide.filename}</span>
        <span className="opacity-60">{t("guides.chars", { n: guide.chars })}</span>
        {guide.text_updated_at && (
          <span className="opacity-60">
            {t("guides.replacedOn", { date: format.dateTime(new Date(guide.text_updated_at), { dateStyle: "medium" }) })}
          </span>
        )}
      </div>
      <p className="text-xs opacity-80">
        {guide.is_global
          ? t("guides.appliesAll")
          : guide.hospital_ids.length
            ? t("guides.linkedTo", { names: guide.hospital_ids.map((h) => names.get(h) ?? `#${h}`).join(", ") })
            : t("guides.notLinked")}
      </p>
      <div className="flex flex-wrap gap-1">
        {tool("text", t("guides.viewText"))}
        {!archived && (
          <>
            {tool("sites", t("guides.editSites"), !!guide.is_global)}
            <Button
              size="sm"
              variant="ghost"
              disabled={flight.busy}
              onClick={() =>
                run(
                  () => docgenApi.updateGuide(guide.id, { is_global: !guide.is_global }),
                  t(guide.is_global ? "guides.madeSiteSpecific" : "guides.madeGlobal"),
                )
              }
            >
              {t(guide.is_global ? "guides.makeSiteSpecific" : "guides.makeGlobal")}
            </Button>
            {tool("rename", t("guides.rename"))}
            {tool("replace", t("guides.replace"))}
          </>
        )}
        {tool("history", t("guides.history"))}
        {!archived && tool("archive", t("guides.archive"))}
      </div>
      {guide.is_global && !archived && <p className="text-xs opacity-70">{t("guides.globalHint")}</p>}

      {mode === "text" && <GuideText id={guide.id} />}
      {mode === "sites" && (
        <HospitalChecklist
          hospitals={hospitals}
          initial={guide.hospital_ids}
          busy={flight.busy}
          onCancel={() => setMode(null)}
          onSave={(ids) => run(() => docgenApi.setGuideHospitals(guide.id, ids), t("guides.sitesSaved", { n: ids.length }))}
        />
      )}
      {mode === "rename" && (
        <RenameBox
          initial={guide.title}
          busy={flight.busy}
          onSave={(title) => run(() => docgenApi.updateGuide(guide.id, { title }), t("guides.renamed"))}
        />
      )}
      {mode === "replace" && (
        <ReplaceBox
          busy={flight.busy}
          onError={(text) => setMessage({ kind: "error", text })}
          onSave={(file) =>
            run(async () => docgenApi.replaceGuideFile(guide.id, await toUpload(file)), t("guides.replacedDone"))
          }
        />
      )}
      {mode === "history" && <GuideHistory id={guide.id} />}
      {mode === "archive" && (
        <span className="flex flex-wrap items-center gap-2">
          {t("guides.confirmArchive")}
          <Button size="sm" variant="destructive" disabled={flight.busy} onClick={() => run(() => docgenApi.archiveGuide(guide.id), t("guides.archivedDone"))}>
            {t("guides.confirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            {t("guides.cancel")}
          </Button>
        </span>
      )}
      {flight.busy && <Spinner aria-hidden />}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function GuideText({ id }: { id: number }) {
  const t = useTranslations("admin");
  const q = useQuery({ queryKey: ["admin", "guide-text", id], queryFn: () => docgenApi.guide(id) });
  if (q.isLoading) return <p className="opacity-70">{t("loading")}</p>;
  if (q.isError) return <p role="alert" className="text-red-600">{adminErrorText(q.error, t)}</p>;
  return (
    <pre className="max-h-80 overflow-auto rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
      {q.data?.body_text}
    </pre>
  );
}

function GuideHistory({ id }: { id: number }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const q = useQuery({ queryKey: ["admin", "guide-history", id], queryFn: () => docgenApi.guideHistory(id) });
  const date = (s: string) => format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" });
  if (q.isLoading) return <p className="opacity-70">{t("loading")}</p>;
  if (q.isError) return <p role="alert" className="text-red-600">{adminErrorText(q.error, t)}</p>;
  if (!q.data?.length) return <p className="opacity-70">{t("guides.noHistory")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {q.data.map((r) => (
        <li key={r.id}>
          <details>
            <summary className="cursor-pointer">
              {t("guides.historyItem", { file: r.filename || "-", from: date(r.valid_from), to: date(r.replaced_at), n: r.chars })}
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap">{r.body_text}</pre>
          </details>
        </li>
      ))}
    </ul>
  );
}

function RenameBox({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (title: string) => void }) {
  const t = useTranslations("admin");
  const [title, setTitle] = useState(initial);
  const clean = title.trim();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean && clean !== initial) onSave(clean);
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        {t("guides.name")}
        <input className="rounded border px-2 py-1.5" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <Button type="submit" size="sm" disabled={busy || !clean || clean === initial}>
        {t("guides.save")}
      </Button>
    </form>
  );
}

function ReplaceBox({ busy, onSave, onError }: { busy: boolean; onSave: (file: File) => void; onError: (text: string) => void }) {
  const t = useTranslations("admin");
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-80">{t("guides.replaceHint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          {t("guides.file")}
          <input type="file" accept=".pdf,.hwp,.hwpx,.docx,.md,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button
          size="sm"
          disabled={busy || !file}
          onClick={() => {
            if (!file) return;
            const problem = guideFileProblem(file);
            if (problem) {
              onError(t(problem === "type" ? "guides.fileType" : problem === "size" ? "guides.fileSize" : "guides.fileEmpty"));
              return;
            }
            onSave(file);
          }}
        >
          {t("guides.replaceButton")}
        </Button>
      </div>
    </div>
  );
}

/** Pick hospitals (searchable by hospital or board name). */
export function HospitalChecklist({
  hospitals,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  hospitals: AdminHospital[];
  initial: number[];
  busy: boolean;
  onSave: (ids: number[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin");
  const [picked, setPicked] = useState<Set<number>>(new Set(initial));
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = [...hospitals]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((h) => !q || h.name.toLowerCase().includes(q) || h.boards.some((b) => b.name.toLowerCase().includes(q)));

  const set = (ids: number[], on: boolean) => {
    const next = new Set(picked);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };
  const changed = picked.size !== initial.length || initial.some((id) => !picked.has(id));

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          {t("guides.searchSites")}
          <input className="rounded border px-2 py-1.5" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Button size="sm" variant="outline" onClick={() => set(shown.map((s) => s.id), true)}>
          {t("guides.selectShown")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => set(shown.map((s) => s.id), false)}>
          {t("guides.clearShown")}
        </Button>
      </div>
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {shown.length === 0 && <p className="opacity-70">{t("guides.noSites")}</p>}
        {shown.map((h) => (
          <label key={h.id} className="flex items-center gap-2">
            <input type="checkbox" checked={picked.has(h.id)} onChange={(e) => set([h.id], e.target.checked)} />
            <span className="break-words">{h.name}</span>
            <span className="text-xs opacity-60">{t("hospitals.boardCount", { n: h.boards.length })}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs opacity-80">{t("guides.selectedCount", { n: picked.size })}</span>
        <Button size="sm" disabled={busy || !changed} onClick={() => onSave([...picked].sort((a, b) => a - b))}>
          {t("guides.saveSites")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("guides.cancel")}
        </Button>
      </div>
    </div>
  );
}
