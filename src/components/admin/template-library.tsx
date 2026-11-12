"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { Section } from "@/components/admin/section";
import { TemplateCard } from "@/components/admin/template-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { docgenApi, templateFileProblem, toUpload } from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

export const TEMPLATES_KEY = ["admin", "templates"] as const;

type Message = { kind: "ok" | "error"; text: string } | null;

export function TemplateLibrary() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const templates = useQuery({
    queryKey: [...TEMPLATES_KEY, showArchived],
    queryFn: () => docgenApi.adminTemplates(showArchived),
  });
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const names = useMemo(
    () => new Map((hospitals.data?.hospitals ?? []).map((h) => [h.id, h.name])),
    [hospitals.data],
  );
  const sortedHospitals = useMemo(
    () => [...(hospitals.data?.hospitals ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [hospitals.data],
  );

  const upload = useSingleFlight();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileBox, setFileBox] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [search, setSearch] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    // The draft form's list of offered forms.
    await queryClient.invalidateQueries({ queryKey: ["docgen", "templates"] });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!title.trim()) return setMessage({ kind: "error", text: t("templates.needName") });
    if (!file) return setMessage({ kind: "error", text: t("guides.needFile") });
    const problem = templateFileProblem(file);
    if (problem) {
      const key = problem === "type" ? "templates.fileType" : problem === "size" ? "guides.fileSize" : "guides.fileEmpty";
      return setMessage({ kind: "error", text: t(key) });
    }
    await upload.run(async () => {
      try {
        const created = await docgenApi.createTemplate(title.trim(), docType.trim(), await toUpload(file));
        setTitle("");
        setDocType("");
        setFile(null);
        setFileBox((n) => n + 1);
        setMessage({ kind: "ok", text: t("templates.uploaded", { n: created.fields.length }) });
        await refresh();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const q = search.trim().toLowerCase();
  const shown = (templates.data ?? []).filter(
    (x) => !q || [x.title, x.doc_type, x.filename].some((s) => s.toLowerCase().includes(q)),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Section icon={FileSpreadsheet} accent="violet" level={1} title={t("templates.title")}>
        <p className="text-sm opacity-80">{t("templates.intro")}</p>
      </Section>

      <Section icon={Upload} accent="blue" title={t("templates.uploadTitle")}>
        <form onSubmit={send} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("guides.name")}
            <input
              className="rounded border px-3 py-2"
              value={title}
              maxLength={200}
              placeholder={t("templates.namePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("templates.docType")}
            <input
              className="rounded border px-3 py-2"
              value={docType}
              maxLength={100}
              placeholder={t("templates.docTypePlaceholder")}
              onChange={(e) => setDocType(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("templates.file")}
            <input key={fileBox} type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <p className="text-xs opacity-70">{t("templates.markerHint")}</p>
          <div>
            <Button type="submit" size="sm" disabled={upload.busy} aria-busy={upload.busy}>
              {upload.busy && <Spinner aria-hidden />}
              {t("guides.upload")}
            </Button>
          </div>
        </form>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
          >
            {message.text}
          </p>
        )}
      </Section>

      <Section icon={FileSpreadsheet} accent="slate" title={t("templates.listTitle")}>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            {t("templates.search")}
            <input className="rounded border px-2 py-1.5" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t("templates.showArchived")}
          </label>
        </div>
        {templates.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {templates.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(templates.error, t)}
          </p>
        )}
        {templates.data?.length === 0 && <p className="text-sm opacity-70">{t("templates.empty")}</p>}
        {!!templates.data?.length && shown.length === 0 && <p className="text-sm opacity-70">{t("templates.noMatch")}</p>}
        <ul className="flex flex-col divide-y">
          {shown.map((x) => (
            <TemplateCard key={x.id} template={x} hospitals={sortedHospitals} names={names} onChanged={refresh} />
          ))}
        </ul>
      </Section>
    </main>
  );
}
