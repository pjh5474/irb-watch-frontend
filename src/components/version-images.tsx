"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

type ImageLink = { file_id: number; filename: string; url: string };
type ImageLinks = { images: ImageLink[]; expires_at: string };

/**
 * The images of one stored version, shown in the page (owner, 2026-11-16): images of the
 * post's text and attached image files. One server call per page view gives short-lived links
 * (about 10 minutes): never refetched by itself (each call is logged and counted per day);
 * when a link has expired the user loads them again.
 */
export function VersionImages({ versionId }: { versionId: number }) {
  const t = useTranslations("doc");
  const [broken, setBroken] = useState(false);
  const links = useQuery({
    queryKey: ["document-images", versionId],
    queryFn: () => apiFetch<ImageLinks>(`/files/versions/${versionId}/image-links`, { method: "POST" }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  function reload() {
    setBroken(false);
    void links.refetch();
  }

  if (links.isPending) return <p className="text-sm opacity-70">{t("imagesLoading")}</p>;
  if (links.isError) {
    const e = links.error;
    // A 429 or 403 carries the server's own reason (the daily limit, an inactive account).
    const text =
      e instanceof ApiError && (e.status === 429 || e.status === 403) && e.message
        ? e.message
        : t(e instanceof ApiError && e.status === 0 ? "imagesUnreachable" : "imagesError");
    return (
      <p role="alert" className="text-sm text-red-600">
        {text}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {broken && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          {t("imagesExpired")}
          <Button size="sm" variant="outline" onClick={reload} disabled={links.isFetching}>
            {t("imagesReload")}
          </Button>
        </p>
      )}
      {links.data.images.map((image) => (
        <figure key={`${image.file_id}-${links.dataUpdatedAt}`} className="flex flex-col gap-1">
          {/* A signed storage link that changes on every load: next/image would only proxy it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={t("imageAlt", { name: image.filename })}
            className="max-w-full rounded border"
            onError={() => setBroken(true)}
          />
          <figcaption className="text-xs opacity-70">{image.filename}</figcaption>
        </figure>
      ))}
    </div>
  );
}
