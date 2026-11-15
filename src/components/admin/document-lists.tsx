"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import {
  DOC_ORIGINS,
  DOC_SECTION_KEYS,
  type DocOrigin,
  type DocSectionKey,
  type DocumentKind,
  type DocumentKindInput,
  type DocumentLists,
  MAX_DOCUMENT_KINDS,
  NEVER_REQUIRED,
  moved,
  pipelineAdminApi as api,
  repeatedName,
} from "@/lib/api/pipeline";
import { useSingleFlight } from "@/lib/use-single-flight";

const GLOBAL = "global";
type Message = { kind: "ok" | "error"; text: string } | null;

const toInput = (k: DocumentKind, keepId: boolean): DocumentKindInput => ({ ...k, id: keepId ? k.id : null });
const blank = (): DocumentKindInput => ({ id: null, name: "", section: "submission", origin: "upload", required: false });

/**
 * Phase C1: the documents a step type needs, as a global list and optional per-hospital lists
 * (server-wide). A new step copies the hospital's own list when it has one, else the global one;
 * existing steps keep their slots. A list is saved whole.
 */
export function DocumentListEditor({ stepTypeId, stepTypeName }: { stepTypeId: number; stepTypeName: string }) {
  const t = useTranslations("admin");
  const queryKey = ["admin", "pipeline", "documents", stepTypeId];
  const lists = useQuery({ queryKey, queryFn: () => api.documentLists(stepTypeId) });
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const sorted = useMemo(
    () => [...(hospitals.data?.hospitals ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [hospitals.data],
  );
  const [scope, setScope] = useState<string>(GLOBAL);
  // Kept here: the list below starts again from the server's rows after each save.
  const [message, setMessage] = useState<Message>(null);
  const own = new Set((lists.data?.hospitals ?? []).map((h) => h.hospital_id));

  return (
    <div className="flex flex-col gap-3 rounded bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
      <h3 className="font-medium">{t("pipeline.documentsTitle", { name: stepTypeName })}</h3>
      <p className="text-xs opacity-80">{t("pipeline.documentsIntro")}</p>
      <label className="flex flex-col gap-1 sm:max-w-sm">
        {t("pipeline.documentsFor")}
        <select
          className="rounded border px-2 py-1.5"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setMessage(null);
          }}
        >
          <option value={GLOBAL}>{t("pipeline.globalList")}</option>
          {sorted.map((h) => (
            <option key={h.id} value={String(h.id)}>
              {own.has(h.id) ? t("pipeline.hospitalOwnList", { name: h.name }) : h.name}
            </option>
          ))}
        </select>
      </label>
      {lists.isError && (
        <p role="alert" className="text-red-600">
          {adminErrorText(lists.error, t)}
        </p>
      )}
      {lists.data && (
        <ListScope
          key={`${scope}-${lists.dataUpdatedAt}`}
          stepTypeId={stepTypeId}
          hospitalId={scope === GLOBAL ? null : Number(scope)}
          lists={lists.data}
          setMessage={setMessage}
        />
      )}
      <Status message={message} />
    </div>
  );
}

function ListScope({
  stepTypeId,
  hospitalId,
  lists,
  setMessage,
}: {
  stepTypeId: number;
  hospitalId: number | null;
  lists: DocumentLists;
  setMessage: (m: Message) => void;
}) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const hospitalList = hospitalId === null ? undefined : lists.hospitals.find((h) => h.hospital_id === hospitalId);
  const usesGlobal = hospitalId !== null && hospitalList === undefined;
  const [rows, setRows] = useState<DocumentKindInput[]>(() =>
    hospitalId === null
      ? lists.global_documents.map((k) => toInput(k, true))
      : (hospitalList?.documents ?? []).map((k) => toInput(k, true)),
  );

  async function run(work: () => Promise<DocumentLists>, ok: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        // Reloads this list too: the rows start again from what the server saved.
        await queryClient.invalidateQueries({ queryKey: ["admin", "pipeline"] });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  function save() {
    const clean = rows.map((r) => ({ ...r, name: r.name.trim().replace(/\s+/g, " ") }));
    if (clean.some((r) => !r.name)) return setMessage({ kind: "error", text: t("pipeline.documentNeedsName") });
    if (hospitalId !== null && clean.length === 0) return setMessage({ kind: "error", text: t("pipeline.hospitalListEmpty") });
    const twice = repeatedName(clean);
    if (twice) return setMessage({ kind: "error", text: t("pipeline.documentTwice", { name: twice }) });
    if (clean.length > MAX_DOCUMENT_KINDS) return setMessage({ kind: "error", text: t("pipeline.documentsTooMany", { n: MAX_DOCUMENT_KINDS }) });
    void run(() => api.saveDocuments(stepTypeId, hospitalId, clean), t("pipeline.saved"));
  }

  const set = (i: number, patch: Partial<DocumentKindInput>) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (usesGlobal) {
    return (
      <div className="flex flex-col gap-2">
        <p>{t("pipeline.documentsUseGlobal", { n: lists.global_documents.length })}</p>
        <div>
          <Button
            size="sm"
            disabled={flight.busy}
            onClick={() =>
              run(
                () => api.saveDocuments(stepTypeId, hospitalId, lists.global_documents.map((k) => toInput(k, false))),
                t("pipeline.ownListMade"),
              )
            }
          >
            {flight.busy && <Spinner aria-hidden />}
            {t("pipeline.makeOwnList")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="opacity-70">{t("pipeline.noDocumentsInList")}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const neverRequired = NEVER_REQUIRED.includes(r.section);
          return (
            <li key={r.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2 rounded border p-2">
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                {t("pipeline.documentName")}
                <input className="rounded border px-2 py-1" value={r.name} maxLength={200} onChange={(e) => set(i, { name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                {t("pipeline.documentSection")}
                <select className="rounded border px-2 py-1" value={r.section} onChange={(e) => set(i, { section: e.target.value as DocSectionKey })}>
                  {DOC_SECTION_KEYS.map((s) => (
                    <option key={s} value={s}>
                      {t(`pipeline.sections.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {t("pipeline.documentOrigin")}
                <select className="rounded border px-2 py-1" value={r.origin} onChange={(e) => set(i, { origin: e.target.value as DocOrigin })}>
                  {DOC_ORIGINS.map((o) => (
                    <option key={o} value={o}>
                      {t(`pipeline.origins.${o}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1">
                <input
                  type="checkbox"
                  checked={r.required && !neverRequired}
                  disabled={neverRequired}
                  onChange={(e) => set(i, { required: e.target.checked })}
                />
                {t("pipeline.documentRequired")}
              </label>
              <span className="flex gap-1 pb-0.5">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setRows((l) => moved(l, i, -1))} aria-label={t("pipeline.moveUp", { name: r.name || "—" })}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => setRows((l) => moved(l, i, 1))} aria-label={t("pipeline.moveDown", { name: r.name || "—" })}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label={t("pipeline.removeDocument", { name: r.name || "—" })}>
                  <X className="size-4" aria-hidden />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={rows.length >= MAX_DOCUMENT_KINDS} onClick={() => setRows((l) => [...l, blank()])}>
          {t("pipeline.addDocumentRow")}
        </Button>
        <Button size="sm" disabled={flight.busy} aria-busy={flight.busy} onClick={save}>
          {flight.busy && <Spinner aria-hidden />}
          {t("pipeline.save")}
        </Button>
        {hospitalId !== null && (
          <Button
            size="sm"
            variant="outline"
            disabled={flight.busy}
            onClick={() => run(() => api.deleteHospitalDocuments(stepTypeId, hospitalId), t("pipeline.backToGlobalDone"))}
          >
            {t("pipeline.backToGlobal")}
          </Button>
        )}
      </div>
      <p className="text-xs opacity-70">{t("pipeline.documentsSaveHint")}</p>
    </div>
  );
}

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}
    >
      {message.text}
    </p>
  );
}
