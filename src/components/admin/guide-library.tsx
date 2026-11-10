"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SOURCES_KEY } from "@/components/admin/admin-sources";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { docgenApi, guideFileProblem, toUpload, type GuideWithText } from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

export const GUIDES_KEY = ["admin", "guides"] as const;
// The draft form's "default guides" lists change with every link, unlink and archive.
const DEFAULT_GUIDES_KEY = ["docgen", "default-guides"] as const;

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

export function GuideLibrary() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const guides = useQuery({
    queryKey: [...GUIDES_KEY, showArchived],
    queryFn: () => docgenApi.guides(showArchived),
  });
  const sources = useQuery({ queryKey: SOURCES_KEY, queryFn: adminApi.sources });
  const names = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s.name])), [sources.data]);

  const upload = useSingleFlight();
  const archive = useSingleFlight();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // A new key empties the file box after an upload (a file input cannot be set by value).
  const [fileBox, setFileBox] = useState(0);
  const [uploaded, setUploaded] = useState<GuideWithText | null>(null);
  const [uploadMessage, setUploadMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [listMessage, setListMessage] = useState<Message>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setUploadMessage(null);
    setUploaded(null);
    if (!title.trim()) return setUploadMessage({ kind: "error", text: t("guides.needName") });
    if (!file) return setUploadMessage({ kind: "error", text: t("guides.needFile") });
    const problem = guideFileProblem(file);
    if (problem) {
      const key = problem === "type" ? "guides.fileType" : problem === "size" ? "guides.fileSize" : "guides.fileEmpty";
      return setUploadMessage({ kind: "error", text: t(key) });
    }
    await upload.run(async () => {
      try {
        const guide = await docgenApi.createGuide(title.trim(), await toUpload(file));
        setUploaded(guide);
        setTitle("");
        setFile(null);
        setFileBox((n) => n + 1);
        await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
      } catch (e) {
        setUploadMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  async function doArchive(id: number) {
    setListMessage(null);
    await archive.run(async () => {
      try {
        await docgenApi.archiveGuide(id);
        setConfirming(null);
        setListMessage({ kind: "ok", text: t("guides.archivedDone") });
        await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
        await queryClient.invalidateQueries({ queryKey: DEFAULT_GUIDES_KEY });
        await queryClient.invalidateQueries({ queryKey: ["admin", "source-guides"] });
      } catch (e) {
        setListMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Section icon={BookOpen} accent="violet" level={1} title={t("guides.title")}>
        <p className="text-sm opacity-80">{t("guides.intro")}</p>
      </Section>

      <Section icon={Upload} accent="blue" title={t("guides.uploadTitle")}>
        <form onSubmit={send} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("guides.name")}
            <input
              className="rounded border px-3 py-2"
              value={title}
              maxLength={200}
              placeholder={t("guides.namePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("guides.file")}
            <input
              key={fileBox}
              type="file"
              accept=".pdf,.hwp,.hwpx,.docx,.md,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div>
            <Button type="submit" size="sm" disabled={upload.busy} aria-busy={upload.busy}>
              {upload.busy && <Spinner aria-hidden />}
              {t("guides.upload")}
            </Button>
          </div>
        </form>
        <Note message={uploadMessage} />
        {uploaded && (
          <div className="flex flex-col gap-1">
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {t("guides.uploaded")}
            </p>
            <pre className="max-h-64 overflow-auto rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
              {uploaded.body_text}
            </pre>
          </div>
        )}
      </Section>

      <Section icon={BookOpen} accent="slate" title={t("guides.listTitle")}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("guides.showArchived")}
        </label>
        {guides.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {guides.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(guides.error, t)}
          </p>
        )}
        {guides.data?.length === 0 && <p className="text-sm opacity-70">{t("guides.empty")}</p>}
        <ul className="flex flex-col divide-y">
          {guides.data?.map((g) => (
            <li key={g.id} className="flex flex-col gap-1 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{g.title}</span>
                <span className="opacity-60">{g.filename}</span>
                <span className="opacity-60">{t("guides.chars", { n: g.chars })}</span>
                {g.archived_at && <Badge>{t("guides.archived")}</Badge>}
              </div>
              <p className="text-xs opacity-70">
                {g.source_ids.length
                  ? t("guides.linkedTo", { names: g.source_ids.map((s) => names.get(s) ?? `#${s}`).join(", ") })
                  : t("guides.notLinked")}
              </p>
              {!g.archived_at &&
                (confirming === g.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {t("guides.confirmArchive")}
                    <Button size="sm" variant="destructive" disabled={archive.busy} onClick={() => doArchive(g.id)}>
                      {t("guides.confirm")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      {t("guides.cancel")}
                    </Button>
                  </span>
                ) : (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(g.id)}>
                      {t("guides.archive")}
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
        <Note message={listMessage} />
      </Section>
    </main>
  );
}

export function SourceGuides({ sourceId }: { sourceId: number }) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const key = ["admin", "source-guides", sourceId];
  const linked = useQuery({ queryKey: key, queryFn: () => docgenApi.sourceGuides(sourceId) });
  const library = useQuery({ queryKey: [...GUIDES_KEY, false], queryFn: () => docgenApi.guides(false) });
  const flight = useSingleFlight();
  const [choice, setChoice] = useState("");
  const [message, setMessage] = useState<Message>(null);

  const linkedIds = new Set((linked.data ?? []).map((g) => g.id));
  const available = (library.data ?? []).filter((g) => !linkedIds.has(g.id));

  async function change(action: "link" | "unlink", guideId: number) {
    setMessage(null);
    await flight.run(async () => {
      try {
        if (action === "link") await docgenApi.linkGuide(sourceId, guideId);
        else await docgenApi.unlinkGuide(sourceId, guideId);
        setChoice("");
        setMessage({ kind: "ok", text: t(action === "link" ? "guides.linked" : "guides.unlinked") });
        await queryClient.invalidateQueries({ queryKey: key });
        await queryClient.invalidateQueries({ queryKey: GUIDES_KEY });
        await queryClient.invalidateQueries({ queryKey: DEFAULT_GUIDES_KEY });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <Section icon={BookOpen} accent="violet" title={t("guides.sourceTitle")}>
      <p className="text-sm opacity-80">{t("guides.sourceHint")}</p>
      {linked.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {linked.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(linked.error, t)}
        </p>
      )}
      {linked.data?.length === 0 && <p className="text-sm opacity-70">{t("guides.sourceEmpty")}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {linked.data?.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <span className="flex-1">{g.title}</span>
            <Button size="sm" variant="ghost" disabled={flight.busy} onClick={() => change("unlink", g.id)}>
              {t("guides.unlink")}
            </Button>
          </li>
        ))}
      </ul>
      {library.data && available.length === 0 ? (
        <p className="text-xs opacity-70">{t("guides.noneLeft")}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("guides.add")}
            <select className="rounded border px-2 py-1.5" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t("guides.choose")}</option>
              {available.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={!choice || flight.busy} onClick={() => change("link", Number(choice))}>
            {t("guides.link")}
          </Button>
        </div>
      )}
      <Note message={message} />
    </Section>
  );
}
