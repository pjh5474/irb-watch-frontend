"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
import { groupFiles, innerName } from "@/lib/file-groups";
import { PAGE_SIZE, clampPage, pageCount, pageRange } from "@/lib/paging";
import type { components } from "@/lib/types/api";

export type FileRow = {
  id: number;
  filename: string;
  size_label: string | null;
  hasOriginal: boolean;
  note: string | null;
};

function errorKey(error: unknown): "notFound" | "limit" | "unavailable" | "unreachable" | "generic" {
  if (error instanceof ApiError) {
    if (error.status === 0) return "unreachable";
    if (error.status === 404) return "notFound";
    if (error.status === 429) return "limit";
    if (error.status === 503) return "unavailable";
  }
  return "generic";
}

function FileLine({
  name,
  file,
  busy,
  error,
  onDownload,
}: {
  name: string;
  file: FileRow;
  busy: boolean;
  error: string;
  onDownload: (file: FileRow) => void;
}) {
  const t = useTranslations("doc");
  return (
    <>
      <span className="min-w-0 flex-1 break-all font-medium">{name}</span>
      {file.size_label && <span className="opacity-70">{file.size_label}</span>}
      {file.note && <span className="opacity-70">{file.note}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onDownload(file)}
        disabled={!file.hasOriginal || busy}
        aria-busy={busy}
        className="ml-auto"
      >
        {busy && <Spinner aria-hidden />}
        {busy ? t("preparing") : file.hasOriginal ? t("download") : t("noOriginal")}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-red-600">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ZipCard({
  zip,
  members,
  busyIds,
  errors,
  onDownload,
}: {
  zip: FileRow;
  members: FileRow[];
  busyIds: readonly number[];
  errors: Record<number, string>;
  onDownload: (file: FileRow) => void;
}) {
  const t = useTranslations("doc");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const panelId = `zip-files-${zip.id}`;
  const term = query.trim().toLowerCase();
  const matched = term
    ? members.filter((m) => innerName(zip.filename, m.filename).toLowerCase().includes(term))
    : members;
  const pages = pageCount(matched.length, PAGE_SIZE);
  const shown = clampPage(page, pages);
  const [from, to] = pageRange(shown, PAGE_SIZE);
  const visible = matched.slice(from, to + 1);

  return (
    <li className="rounded border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md text-left font-medium focus-visible:outline-none"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t(open ? "zipClose" : "zipOpen", { name: zip.filename })}
          onClick={() => setOpen((value) => !value)}
        >
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-colors duration-150 group-hover:bg-muted group-focus-visible:ring-3 group-focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <ChevronRight
              className={`size-5 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            />
          </span>
          <span className="break-all">{zip.filename}</span>
          <span className="shrink-0 text-xs font-normal opacity-70">{t("zipCount", { n: members.length })}</span>
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDownload(zip)}
          disabled={!zip.hasOriginal || busyIds.includes(zip.id)}
          aria-busy={busyIds.includes(zip.id)}
        >
          {busyIds.includes(zip.id) && <Spinner aria-hidden />}
          {busyIds.includes(zip.id) ? t("preparing") : zip.hasOriginal ? t("download") : t("noOriginal")}
        </Button>
      </div>
      {(zip.size_label || zip.note || errors[zip.id]) && (
        <p className="mt-1 text-xs opacity-70">
          {zip.size_label}
          {zip.size_label && zip.note ? " · " : ""}
          {zip.note}
          {errors[zip.id] ? (
            <span role="alert" className="mt-1 block text-sm text-red-600">
              {errors[zip.id]}
            </span>
          ) : null}
        </p>
      )}
      {open ? (
        <div id={panelId} className="animate-open mt-3 flex flex-col gap-2 border-t pt-3">
          <label className="flex max-w-64 flex-col gap-1 text-xs">
            {t("zipSearch")}
            <input
              value={query}
              placeholder={t("zipSearchPlaceholder")}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="rounded border px-2 py-1 text-sm"
            />
          </label>
          {matched.length === 0 ? (
            <p className="text-sm opacity-70">{t("noZipMatches")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
                  <FileLine
                    name={innerName(zip.filename, member.filename)}
                    file={member}
                    busy={busyIds.includes(member.id)}
                    error={errors[member.id] ?? ""}
                    onDownload={onDownload}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={shown} pages={pages} onPage={setPage} />
        </div>
      ) : null}
    </li>
  );
}

export function FileList({ files }: { files: FileRow[] }) {
  const t = useTranslations("doc");
  const [busyIds, setBusyIds] = useState<readonly number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  // A ref, not state: state only changes after the next render, so two clicks in the same
  // instant would both pass a state check. Each click also counts toward the daily cap.
  const inFlight = useRef(new Set<number>());
  const entries = groupFiles(files);

  // The link is requested only on click and opened at once: it lives 60 seconds and every
  // request counts toward the daily cap, so it is never prefetched, cached or rendered.
  async function download(file: FileRow) {
    if (inFlight.current.has(file.id)) return;
    inFlight.current.add(file.id);
    setBusyIds((prev) => [...prev, file.id]);
    setErrors((prev) => ({ ...prev, [file.id]: "" }));
    try {
      const link = await apiFetch<components["schemas"]["DownloadLinkOut"]>(`/files/${file.id}/download-url`, {
        method: "POST",
      });
      const a = document.createElement("a");
      a.href = link.url;
      a.download = link.filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      // A 403 (for example a deleted account) carries the server's own reason: show it.
      const text =
        error instanceof ApiError && error.status === 403 && error.message
          ? error.message
          : t(`downloadError.${errorKey(error)}`);
      setErrors((prev) => ({ ...prev, [file.id]: text }));
    } finally {
      inFlight.current.delete(file.id);
      setBusyIds((prev) => prev.filter((id) => id !== file.id));
    }
  }

  if (files.length === 0) return <p className="text-sm opacity-70">{t("noFiles")}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry, index) =>
        entry.kind === "file" ? (
          <li
            key={entry.file.id}
            className="reveal flex flex-wrap items-center gap-3 rounded border p-3 text-sm"
            style={{ "--i": index } as React.CSSProperties}
          >
            <FileLine
              name={entry.file.filename}
              file={entry.file}
              busy={busyIds.includes(entry.file.id)}
              error={errors[entry.file.id] ?? ""}
              onDownload={download}
            />
          </li>
        ) : (
          <ZipCard
            key={entry.zip.id}
            zip={entry.zip}
            members={entry.members}
            busyIds={busyIds}
            errors={errors}
            onDownload={download}
          />
        ),
      )}
    </ul>
  );
}
