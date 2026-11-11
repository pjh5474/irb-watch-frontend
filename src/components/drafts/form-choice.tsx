"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { FieldList } from "@/components/drafts/form-fields";
import { Spinner } from "@/components/ui/spinner";
import { docgenApi, templateFileProblem, toUpload, type FormField, type FormTemplate } from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

/** The form a new draft fills: none (a Markdown draft), one from the list, or a one-off file
 * (checked by the server first, so the user sees its fields before paying for a draft). */
export type FormPick =
  | { kind: "none" }
  | { kind: "list"; id: number }
  | { kind: "file"; file: File | null; fields: FormField[] | null };

export const NO_FORM: FormPick = { kind: "none" };

/** The request's part for the chosen form. */
export async function formRequest(pick: FormPick) {
  if (pick.kind === "list") return { template_id: pick.id };
  if (pick.kind === "file" && pick.file) return { template_file: await toUpload(pick.file) };
  return {};
}

/** The forms offered for documents from these sources (shared by the picker and the page). */
export function useOfferedForms(sourceIds: number[]) {
  return useQuery({
    queryKey: ["docgen", "templates", sourceIds.join(",")],
    queryFn: () => docgenApi.templates(sourceIds),
    enabled: sourceIds.length > 0,
  });
}

/** Can the request be sent with this form? A file must be chosen and its fields found; a
 * listed form must still be offered for the documents chosen now. */
export function formReady(pick: FormPick, offered: FormTemplate[] | undefined): boolean {
  if (pick.kind === "file") return pick.file !== null && pick.fields !== null;
  if (pick.kind === "list") return !!offered?.some((x) => x.id === pick.id);
  return true;
}

export function FormChoice({
  sourceIds,
  value,
  onChange,
}: {
  sourceIds: number[];
  value: FormPick;
  onChange: (next: FormPick) => void;
}) {
  const t = useTranslations("drafts");
  const list = useOfferedForms(sourceIds);
  const check = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const chosen = value.kind === "list" ? list.data?.find((x) => x.id === value.id) : undefined;
  // A listed form that is not offered for the documents chosen now (the page will not send).
  const listGone = value.kind === "list" && !list.isFetching && !chosen;

  async function pickFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const problem = templateFileProblem(file);
    if (problem) {
      setError(t(problem === "type" ? "form.fileType" : problem === "size" ? "form.fileSize" : "form.fileEmpty"));
      return;
    }
    onChange({ kind: "file", file, fields: null });
    await check.run(async () => {
      try {
        const res = await docgenApi.checkTemplate(await toUpload(file));
        onChange({ kind: "file", file, fields: res.fields });
      } catch (e) {
        onChange(NO_FORM);
        setError(adminErrorText(e, t));
      }
    });
  }

  const select = value.kind === "list" ? `list:${value.id}` : value.kind === "file" ? "file" : "none";

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        {t("form.choose")}
        <select
          className="rounded border px-2 py-1.5"
          value={select}
          onChange={(e) => {
            setError(null);
            const v = e.target.value;
            if (v === "none") onChange(NO_FORM);
            else if (v === "file") onChange({ kind: "file", file: null, fields: null });
            else onChange({ kind: "list", id: Number(v.slice(5)) });
          }}
        >
          <option value="none">{t("form.none")}</option>
          {(list.data ?? []).map((tpl) => (
            <option key={tpl.id} value={`list:${tpl.id}`}>
              {tpl.doc_type ? `${tpl.title} (${tpl.doc_type})` : tpl.title}
              {tpl.is_global ? ` · ${t("form.global")}` : ""}
            </option>
          ))}
          {listGone && value.kind === "list" && (
            <option value={`list:${value.id}`} disabled>
              {t("form.goneOption")}
            </option>
          )}
          <option value="file">{t("form.upload")}</option>
        </select>
      </label>
      {sourceIds.length > 0 && list.isSuccess && list.data.length === 0 && (
        <p className="text-xs opacity-70">{t("form.noneOffered")}</p>
      )}
      {list.isError && (
        <p role="alert" className="text-red-600">
          {adminErrorText(list.error, t)}
        </p>
      )}
      {listGone && (
        <p role="alert" className="text-amber-700">
          {t("form.notOffered")}
        </p>
      )}
      {value.kind === "none" && <p className="text-xs opacity-70">{t("form.noneHint")}</p>}
      {chosen && (
        <>
          <p className="text-xs opacity-80">{t("form.listHint", { n: chosen.fields.length, file: chosen.filename })}</p>
          <FieldList fields={chosen.fields} />
        </>
      )}
      {value.kind === "file" && (
        <>
          <label className="flex flex-col gap-1">
            {t("form.file")}
            <input type="file" accept=".docx" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
          {check.busy && (
            <p role="status" className="flex items-center gap-2 opacity-70">
              <Spinner aria-hidden /> {t("form.checking")}
            </p>
          )}
          {value.fields && (
            <>
              <p className="text-xs opacity-80">{t("form.found", { n: value.fields.length })}</p>
              <FieldList fields={value.fields} />
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
