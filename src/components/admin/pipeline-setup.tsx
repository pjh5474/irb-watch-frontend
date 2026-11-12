"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Flag, ListOrdered, Workflow, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { docgenApi } from "@/lib/api/docgen";
import {
  MAX_INSTRUCTIONS,
  type StepStatus,
  type StepType,
  type StepTypeInput,
  moved,
  pipelineAdminApi as api,
  requiredDocsFromText,
} from "@/lib/api/pipeline";
import { useSingleFlight } from "@/lib/use-single-flight";

export const PIPELINE_KEY = ["admin", "pipeline"] as const;

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

/** Runs one admin change at a time and reports it; refreshes the pipeline queries after. */
function useAction() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  async function act(work: () => Promise<unknown>, ok: string): Promise<boolean> {
    setMessage(null);
    const done = await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        await queryClient.invalidateQueries({ queryKey: PIPELINE_KEY });
        return true;
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
        return false;
      }
    });
    return done ?? false;
  }
  return { act, busy: flight.busy, message, setMessage };
}

export function PipelineSetup() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <Section icon={Workflow} accent="violet" level={1} title={t("pipeline.title")}>
        <p className="text-sm opacity-80">{t("pipeline.intro")}</p>
      </Section>
      <StepOrder />
      <StepTypes />
      <Statuses />
    </main>
  );
}

// ---- statuses ---------------------------------------------------------------------------------

function Statuses() {
  const t = useTranslations("admin");
  const [showArchived, setShowArchived] = useState(false);
  const statuses = useQuery({
    queryKey: [...PIPELINE_KEY, "statuses", showArchived],
    queryFn: () => api.statuses(showArchived),
  });
  const { act, busy, message, setMessage } = useAction();
  const [label, setLabel] = useState("");
  const [closed, setClosed] = useState(false);
  const live = (statuses.data ?? []).filter((s) => s.archived_at === null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return setMessage({ kind: "error", text: t("pipeline.needName") });
    if (await act(() => api.addStatus(label.trim(), closed), t("pipeline.saved"))) {
      setLabel("");
      setClosed(false);
    }
  }

  function move(index: number, by: -1 | 1) {
    const keys = moved(live.map((s) => s.key), index, by);
    return act(() => api.reorderStatuses(keys), t("pipeline.saved"));
  }

  return (
    <Section icon={Flag} accent="amber" title={t("pipeline.statusesTitle")}>
      <p className="text-sm opacity-80">{t("pipeline.statusesIntro")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {t("pipeline.showArchived")}
      </label>
      {statuses.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(statuses.error, t)}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {(statuses.data ?? []).map((s) => (
          <StatusRow
            key={s.key}
            status={s}
            index={live.findIndex((x) => x.key === s.key)}
            count={live.length}
            busy={busy}
            act={act}
            onMove={move}
          />
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          {t("pipeline.newStatus")}
          <input className="rounded border px-2 py-1.5" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          {t("pipeline.closed")}
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t("pipeline.add")}
        </Button>
      </form>
      <Note message={message} />
    </Section>
  );
}

function StatusRow({
  status,
  index,
  count,
  busy,
  act,
  onMove,
}: {
  status: StepStatus;
  index: number;
  count: number;
  busy: boolean;
  act: (work: () => Promise<unknown>, ok: string) => Promise<boolean>;
  onMove: (index: number, by: -1 | 1) => Promise<boolean>;
}) {
  const t = useTranslations("admin");
  const [label, setLabel] = useState(status.label);
  const archived = status.archived_at !== null;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      {archived ? (
        <span className="opacity-70">{status.label}</span>
      ) : (
        <>
          <label className="sr-only" htmlFor={`status-${status.key}`}>
            {t("pipeline.statusName")}
          </label>
          <input
            id={`status-${status.key}`}
            className="w-40 rounded border px-2 py-1"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label.trim() && label.trim() !== status.label)
                void act(() => api.updateStatus(status.key, { label: label.trim() }), t("pipeline.saved"));
            }}
          />
        </>
      )}
      {status.closed && <Badge tone="good">{t("pipeline.closed")}</Badge>}
      {archived && <Badge>{t("pipeline.archived")}</Badge>}
      <span className="ml-auto flex flex-wrap gap-1">
        {!archived && (
          <>
            <Button size="sm" variant="outline" disabled={busy || index <= 0} onClick={() => onMove(index, -1)} aria-label={t("pipeline.up", { name: status.label })}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" disabled={busy || index >= count - 1} onClick={() => onMove(index, 1)} aria-label={t("pipeline.down", { name: status.label })}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => act(() => api.updateStatus(status.key, { closed: !status.closed }), t("pipeline.saved"))}
            >
              {status.closed ? t("pipeline.markOpen") : t("pipeline.markClosed")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.archiveStatus(status.key), t("pipeline.saved"))}>
              {t("pipeline.archive")}
            </Button>
          </>
        )}
        {archived && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.restoreStatus(status.key), t("pipeline.saved"))}>
            {t("pipeline.restore")}
          </Button>
        )}
      </span>
    </li>
  );
}

// ---- step types -------------------------------------------------------------------------------

const EMPTY: StepTypeInput = {
  name: "",
  description: "",
  instructions: "",
  guide_ids: [],
  form_template_id: null,
  input_earlier_steps: true,
  input_board_documents: false,
  required_documents: [],
};

function StepTypes() {
  const t = useTranslations("admin");
  const [showArchived, setShowArchived] = useState(false);
  const types = useQuery({
    queryKey: [...PIPELINE_KEY, "types", showArchived],
    queryFn: () => api.stepTypes(showArchived),
  });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const { act, busy, message, setMessage } = useAction();
  // The editor closes after a save, so its success line is shown here.
  const saved = () => {
    setEditing(null);
    setMessage({ kind: "ok", text: t("pipeline.saved") });
  };
  const cancel = () => setEditing(null);

  return (
    <Section icon={Workflow} accent="blue" title={t("pipeline.typesTitle")}>
      <p className="text-sm opacity-80">{t("pipeline.typesIntro")}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("pipeline.showArchived")}
        </label>
        <Button size="sm" onClick={() => setEditing("new")} disabled={editing === "new"}>
          {t("pipeline.newType")}
        </Button>
      </div>
      {types.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(types.error, t)}
        </p>
      )}
      {editing === "new" && <StepTypeEditor initial={EMPTY} onSaved={saved} onCancel={cancel} />}
      <ul className="flex flex-col divide-y">
        {(types.data ?? []).map((type) => (
          <li key={type.id} className="flex flex-col gap-2 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{type.name}</span>
              {type.archived_at && <Badge>{t("pipeline.archived")}</Badge>}
              {type.instructions && <Badge tone="good">{t("pipeline.hasInstructions")}</Badge>}
              {type.required_documents.length > 0 && (
                <span className="opacity-70">{t("pipeline.requiredCount", { n: type.required_documents.length })}</span>
              )}
              <span className="ml-auto flex gap-1">
                {!type.archived_at && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(editing === type.id ? null : type.id)}>
                    {editing === type.id ? t("pipeline.close") : t("pipeline.edit")}
                  </Button>
                )}
                {!type.archived_at ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.archiveStepType(type.id), t("pipeline.saved"))}>
                    {t("pipeline.archive")}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.restoreStepType(type.id), t("pipeline.saved"))}>
                    {t("pipeline.restore")}
                  </Button>
                )}
              </span>
            </div>
            {type.description && <p className="opacity-80">{type.description}</p>}
            {editing === type.id && <StepTypeEditor id={type.id} initial={type} onSaved={saved} onCancel={cancel} />}
          </li>
        ))}
      </ul>
      <Note message={message} />
    </Section>
  );
}

function StepTypeEditor({
  id,
  initial,
  onSaved,
  onCancel,
}: {
  id?: number;
  initial: StepTypeInput;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin");
  const guides = useQuery({ queryKey: [...PIPELINE_KEY, "guides"], queryFn: () => docgenApi.guides(false) });
  const forms = useQuery({ queryKey: [...PIPELINE_KEY, "forms"], queryFn: () => docgenApi.adminTemplates(false) });
  const readyForms = (forms.data ?? []).filter((f) => f.status === "ready");
  const [value, setValue] = useState<StepTypeInput>({
    name: initial.name,
    description: initial.description,
    instructions: initial.instructions,
    guide_ids: [...initial.guide_ids],
    form_template_id: initial.form_template_id,
    input_earlier_steps: initial.input_earlier_steps,
    input_board_documents: initial.input_board_documents,
    required_documents: [...initial.required_documents],
  });
  const [docsText, setDocsText] = useState(initial.required_documents.join("\n"));
  const { act, busy, message, setMessage } = useAction();
  const set = (patch: Partial<StepTypeInput>) => setValue((v) => ({ ...v, ...patch }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!value.name.trim()) return setMessage({ kind: "error", text: t("pipeline.needName") });
    if (value.instructions.length > MAX_INSTRUCTIONS)
      return setMessage({ kind: "error", text: t("pipeline.tooLong", { n: MAX_INSTRUCTIONS }) });
    const body = { ...value, name: value.name.trim(), required_documents: requiredDocsFromText(docsText) };
    const ok = await act(
      () => (id === undefined ? api.createStepType(body) : api.updateStepType(id, body)),
      t("pipeline.saved"),
    );
    if (ok) onSaved();
  }

  const prefix = `type-${id ?? "new"}`;
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
      <label className="flex flex-col gap-1">
        {t("pipeline.typeName")}
        <input className="rounded border px-2 py-1.5" value={value.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        {t("pipeline.description")}
        <textarea className="rounded border px-2 py-1.5" rows={2} maxLength={1000} value={value.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-instructions`}>{t("pipeline.instructions")}</label>
        <textarea
          id={`${prefix}-instructions`}
          aria-describedby={`${prefix}-instructions-hint`}
          className="rounded border px-2 py-1.5"
          rows={5}
          value={value.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
        />
        <span id={`${prefix}-instructions-hint`} className="text-xs opacity-70">
          {t("pipeline.instructionsHint", { used: value.instructions.length, n: MAX_INSTRUCTIONS })}
        </span>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend>{t("pipeline.guides")}</legend>
        {(guides.data ?? []).length === 0 && <span className="opacity-70">{t("pipeline.noGuides")}</span>}
        {(guides.data ?? []).map((g) => (
          <label key={g.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.guide_ids.includes(g.id)}
              onChange={(e) =>
                set({ guide_ids: e.target.checked ? [...value.guide_ids, g.id] : value.guide_ids.filter((x) => x !== g.id) })
              }
            />
            {g.title}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        {t("pipeline.form")}
        <select
          className="rounded border px-2 py-1.5"
          value={value.form_template_id ?? ""}
          onChange={(e) => set({ form_template_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{t("pipeline.noForm")}</option>
          {readyForms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend>{t("pipeline.inputs")}</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.input_earlier_steps} onChange={(e) => set({ input_earlier_steps: e.target.checked })} />
          {t("pipeline.inputEarlier")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.input_board_documents} onChange={(e) => set({ input_board_documents: e.target.checked })} />
          {t("pipeline.inputBoard")}
        </label>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-docs`}>{t("pipeline.requiredDocs")}</label>
        <textarea
          id={`${prefix}-docs`}
          aria-describedby={`${prefix}-docs-hint`}
          className="rounded border px-2 py-1.5"
          rows={4}
          value={docsText}
          onChange={(e) => setDocsText(e.target.value)}
        />
        <span id={`${prefix}-docs-hint`} className="text-xs opacity-70">
          {t("pipeline.requiredDocsHint")}
        </span>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy && <Spinner aria-hidden />}
          {t("pipeline.save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t("pipeline.cancel")}
        </Button>
      </div>
      <Note message={message} />
    </form>
  );
}

// ---- default step order -----------------------------------------------------------------------

function StepOrder() {
  const t = useTranslations("admin");
  const templates = useQuery({ queryKey: [...PIPELINE_KEY, "templates"], queryFn: api.templates });
  const types = useQuery({ queryKey: [...PIPELINE_KEY, "types", false], queryFn: () => api.stepTypes(false) });
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const [scope, setScope] = useState<string>("global");
  const hospitalId = scope === "global" ? null : Number(scope);
  const saved = (templates.data ?? []).find((x) => x.hospital_id === hospitalId);
  const global = (templates.data ?? []).find((x) => x.hospital_id === null);
  const sortedHospitals = useMemo(
    () => [...(hospitals.data?.hospitals ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [hospitals.data],
  );
  const overridden = new Set((templates.data ?? []).map((x) => x.hospital_id));

  return (
    <Section icon={ListOrdered} accent="slate" title={t("pipeline.orderTitle")}>
      <p className="text-sm opacity-80">{t("pipeline.orderIntro")}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("pipeline.scope")}
        <select className="rounded border px-2 py-1.5" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="global">{t("pipeline.global")}</option>
          {sortedHospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
              {overridden.has(h.id) ? ` · ${t("pipeline.ownOrder")}` : ""}
            </option>
          ))}
        </select>
      </label>
      {(templates.isError || types.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(templates.error ?? types.error, t)}
        </p>
      )}
      {templates.data && types.data && (
        <OrderEditor
          key={`${scope}-${saved?.updated_at ?? "none"}`}
          hospitalId={hospitalId}
          initial={saved?.step_type_ids ?? global?.step_type_ids ?? []}
          hasOwn={hospitalId !== null && saved !== undefined}
          types={types.data}
        />
      )}
    </Section>
  );
}

function OrderEditor({
  hospitalId,
  initial,
  hasOwn,
  types,
}: {
  hospitalId: number | null;
  initial: number[];
  hasOwn: boolean;
  types: StepType[];
}) {
  const t = useTranslations("admin");
  const [ids, setIds] = useState<number[]>(initial);
  const [adding, setAdding] = useState("");
  const { act, busy, message } = useAction();
  const names = new Map(types.map((x) => [x.id, x.name]));
  const addable = types.filter((x) => !ids.includes(x.id));

  return (
    <div className="flex flex-col gap-2 text-sm">
      {hospitalId !== null && !hasOwn && <p className="opacity-70">{t("pipeline.usesGlobal")}</p>}
      <ol className="flex flex-col gap-1">
        {ids.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-6 text-right tabular-nums opacity-70">{i + 1}.</span>
            <span className="flex-1">{names.get(id) ?? t("pipeline.unknownType", { id })}</span>
            <Button size="sm" variant="outline" disabled={i === 0} onClick={() => setIds(moved(ids, i, -1))} aria-label={t("pipeline.up", { name: names.get(id) ?? id })}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" disabled={i === ids.length - 1} onClick={() => setIds(moved(ids, i, 1))} aria-label={t("pipeline.down", { name: names.get(id) ?? id })}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t("pipeline.remove", { name: names.get(id) ?? id })}>
              <X className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      {addable.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="add-step-type">
            {t("pipeline.addStep")}
          </label>
          <select id="add-step-type" className="rounded border px-2 py-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t("pipeline.addStep")}</option>
            {addable.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!adding}
            onClick={() => {
              setIds([...ids, Number(adding)]);
              setAdding("");
            }}
          >
            {t("pipeline.add")}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => act(() => api.saveTemplate(hospitalId, ids), t("pipeline.orderSaved"))}>
          {hospitalId === null ? t("pipeline.saveGlobal") : t("pipeline.saveOwn")}
        </Button>
        {hospitalId !== null && hasOwn && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.deleteTemplate(hospitalId), t("pipeline.ownRemoved"))}>
            {t("pipeline.useGlobal")}
          </Button>
        )}
      </div>
      <Note message={message} />
    </div>
  );
}
