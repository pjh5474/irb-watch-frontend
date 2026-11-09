"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
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

export function FileList({ files }: { files: FileRow[] }) {
  const t = useTranslations("doc");
  const [busyIds, setBusyIds] = useState<readonly number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  // A ref, not state: state only changes after the next render, so two clicks in the same
  // instant would both pass a state check. Each click also counts toward the daily cap.
  const inFlight = useRef(new Set<number>());

  // The link is requested only on click and opened at once: it lives 60 seconds and every
  // request counts toward the daily cap, so it is never prefetched, cached or rendered.
  async function download(file: FileRow) {
    if (inFlight.current.has(file.id)) return;
    inFlight.current.add(file.id);
    setBusyIds((prev) => [...prev, file.id]);
    setErrors((prev) => ({ ...prev, [file.id]: "" }));
    try {
      const link = await apiFetch<components["schemas"]["DownloadLinkOut"]>(
        `/files/${file.id}/download-url`,
        { method: "POST" },
      );
      const a = document.createElement("a");
      a.href = link.url;
      a.download = link.filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      setErrors((prev) => ({ ...prev, [file.id]: t(`downloadError.${errorKey(error)}`) }));
    } finally {
      inFlight.current.delete(file.id);
      setBusyIds((prev) => prev.filter((id) => id !== file.id));
    }
  }

  if (files.length === 0) return <p className="text-sm opacity-70">{t("noFiles")}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file, index) => {
        const busy = busyIds.includes(file.id);
        return (
          <li
            key={file.id}
            className="reveal flex flex-wrap items-center gap-3 rounded border p-3 text-sm"
            style={{ "--i": index } as React.CSSProperties}
          >
            <span className="font-medium">{file.filename}</span>
            {file.size_label && <span className="opacity-70">{file.size_label}</span>}
            {file.note && <span className="opacity-70">{file.note}</span>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(file)}
              disabled={!file.hasOriginal || busy}
              aria-busy={busy}
              className="ml-auto"
            >
              {busy && <Spinner aria-hidden />}
              {busy ? t("preparing") : file.hasOriginal ? t("download") : t("noOriginal")}
            </Button>
            {errors[file.id] && (
              <p role="alert" className="w-full text-red-600">
                {errors[file.id]}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
