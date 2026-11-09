"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/types/api";

export type FileRow = {
  id: number;
  filename: string;
  size_label: string | null;
  hasOriginal: boolean;
  note: string | null;
};

function errorKey(error: unknown): "notFound" | "limit" | "unavailable" | "generic" {
  if (error instanceof ApiError) {
    if (error.status === 404) return "notFound";
    if (error.status === 429) return "limit";
    if (error.status === 503) return "unavailable";
  }
  return "generic";
}

export function FileList({ files }: { files: FileRow[] }) {
  const t = useTranslations("doc");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  // The link is requested only on click and opened at once: it lives 60 seconds and every
  // request counts toward the daily cap, so it is never prefetched, cached or rendered.
  async function download(file: FileRow) {
    setBusyId(file.id);
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
      setBusyId(null);
    }
  }

  if (files.length === 0) return <p className="text-sm opacity-70">{t("noFiles")}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
          <span className="font-medium">{file.filename}</span>
          {file.size_label && <span className="opacity-70">{file.size_label}</span>}
          {file.note && <span className="opacity-70">{file.note}</span>}
          <button
            onClick={() => download(file)}
            disabled={!file.hasOriginal || busyId === file.id}
            className="ml-auto rounded border px-3 py-1 disabled:opacity-50"
          >
            {file.hasOriginal ? t("download") : t("noOriginal")}
          </button>
          {errors[file.id] && (
            <p role="alert" className="w-full text-red-600">
              {errors[file.id]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
