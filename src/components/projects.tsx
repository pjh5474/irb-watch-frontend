"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { pipelinesKey } from "@/components/pipelines/project-pipelines";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { pipelineApi } from "@/lib/api/pipelines";
import {
  cleanNote,
  MAX_NAME,
  MAX_NOTE,
  MAX_SITES,
  projectErrorKey,
  projectProblem,
} from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";
import { useSingleFlight } from "@/lib/use-single-flight";

// The editing parts of the projects screens. The pages read the data on the server; these
// components write through Supabase (row-level security: owner only, readable sites only) and
// then refresh the page, so what is shown always comes from the database.

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

function NameAndNote({
  name,
  note,
  onName,
  onNote,
}: {
  name: string;
  note: string;
  onName: (v: string) => void;
  onNote: (v: string) => void;
}) {
  const t = useTranslations("projects");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {t("name")}
        <input
          className="rounded border px-3 py-2"
          value={name}
          maxLength={MAX_NAME}
          placeholder={t("namePlaceholder")}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("note")}
        <textarea
          className="min-h-20 rounded border px-3 py-2"
          value={note}
          maxLength={MAX_NOTE}
          placeholder={t("notePlaceholder")}
          onChange={(e) => onNote(e.target.value)}
        />
      </label>
    </>
  );
}

/** The "new project" form on the projects list. Opens the new project when it is saved. */
export function NewProjectForm() {
  const t = useTranslations("projects");
  const router = useRouter();
  const flight = useSingleFlight();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const problem = projectProblem(name, note);
    if (problem) return setMessage({ kind: "error", text: t(`problems.${problem}`) });
    await flight.run(async () => {
      const { data, error } = await createClient()
        .from("projects")
        .insert({ name: name.trim(), note: cleanNote(note) })
        .select("id")
        .single();
      if (error || !data) {
        setMessage({ kind: "error", text: t(`errors.${projectErrorKey(error)}`) });
        return;
      }
      router.push(`/projects/${data.id}`);
    });
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-3">
      <NameAndNote name={name} note={note} onName={setName} onNote={setNote} />
      <div>
        <Button type="submit" size="sm" disabled={flight.busy} aria-busy={flight.busy}>
          {flight.busy && <Spinner aria-hidden />}
          {t("create")}
        </Button>
      </div>
      <Note message={message} />
    </form>
  );
}

/** Rename, change the note, or delete one project. */
export function ProjectSettings({ id, name: savedName, note: savedNote }: { id: number; name: string; note: string | null }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const flight = useSingleFlight();
  const [name, setName] = useState(savedName);
  const [note, setNote] = useState(savedNote ?? "");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const problem = projectProblem(name, note);
    if (problem) return setMessage({ kind: "error", text: t(`problems.${problem}`) });
    await flight.run(async () => {
      const { data, error } = await createClient()
        .from("projects")
        .update({ name: name.trim(), note: cleanNote(note) })
        .eq("id", id)
        .select("id");
      // No row back = the project is gone (deleted in another tab): say so, never "saved".
      if (error || !data?.length) {
        setMessage({ kind: "error", text: t(error ? `errors.${projectErrorKey(error)}` : "errors.gone") });
        return;
      }
      setMessage({ kind: "ok", text: t("saved") });
      router.refresh();
    });
  }

  async function remove() {
    setMessage(null);
    await flight.run(async () => {
      const { error } = await createClient().from("projects").delete().eq("id", id);
      if (error) {
        setMessage({ kind: "error", text: t(`errors.${projectErrorKey(error)}`) });
        return;
      }
      router.push("/projects");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={save} className="flex flex-col gap-3">
        <NameAndNote name={name} note={note} onName={setName} onNote={setNote} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={flight.busy} aria-busy={flight.busy}>
            {flight.busy && <Spinner aria-hidden />}
            {t("save")}
          </Button>
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {t("confirmDelete")}
              <Button type="button" size="sm" variant="destructive" disabled={flight.busy} onClick={() => void remove()}>
                {t("delete")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              {t("delete")}
            </Button>
          )}
        </div>
      </form>
      <Note message={message} />
    </div>
  );
}

/** A hospital of a project with the boards the user can read (RLS hides the others). */
export type HospitalRow = { id: number; name: string; boards: { id: number; name: string }[] };

/**
 * The hospitals of one project. Any hospital may be added (owner, 2026-11-12); its boards stay
 * gated per board, so a hospital may show no board at all. `available` are hospitals not yet
 * linked.
 */
export function ProjectHospitals({
  projectId,
  hospitals,
  available,
}: {
  projectId: number;
  hospitals: HospitalRow[];
  available: { id: number; name: string }[];
}) {
  const t = useTranslations("projects");
  const router = useRouter();
  const flight = useSingleFlight();
  const [choice, setChoice] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const full = hospitals.length >= MAX_SITES;
  // Hospitals with a live IRB pipeline: removing one asks first (the pipeline stays).
  const pipelines = useQuery({ queryKey: [...pipelinesKey(projectId), false], queryFn: () => pipelineApi.list(projectId) });
  const withPipeline = new Set((pipelines.data ?? []).map((p) => p.hospital_id));
  const [confirming, setConfirming] = useState<number | null>(null);

  async function add() {
    setMessage(null);
    if (!choice) return;
    await flight.run(async () => {
      const { error } = await createClient()
        .from("project_hospitals")
        .insert({ project_id: projectId, hospital_id: Number(choice) });
      if (error) {
        setMessage({ kind: "error", text: t(`errors.${projectErrorKey(error)}`) });
        return;
      }
      setChoice("");
      setMessage({ kind: "ok", text: t("siteAdded") });
      router.refresh();
    });
  }

  async function remove(hospitalId: number) {
    setMessage(null);
    if (withPipeline.has(hospitalId) && confirming !== hospitalId) {
      setConfirming(hospitalId);
      return;
    }
    setConfirming(null);
    await flight.run(async () => {
      const { error } = await createClient()
        .from("project_hospitals")
        .delete()
        .eq("project_id", projectId)
        .eq("hospital_id", hospitalId);
      if (error) {
        setMessage({ kind: "error", text: t(`errors.${projectErrorKey(error)}`) });
        return;
      }
      setMessage({ kind: "ok", text: t("siteRemoved") });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {hospitals.length === 0 && <p className="text-sm opacity-70">{t("noSites")}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {hospitals.map((h) => (
          <li key={h.id} className="flex flex-col gap-1 rounded border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium">{h.name}</span>
              {confirming === h.id && <span className="text-xs text-amber-700 dark:text-amber-300">{t("removeSiteWithPipeline")}</span>}
              <Button size="sm" variant="ghost" disabled={flight.busy} onClick={() => void remove(h.id)}>
                {confirming === h.id ? t("removeSiteAnyway") : t("removeSite")}
              </Button>
              {confirming === h.id && (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  {t("cancel")}
                </Button>
              )}
            </div>
            <p className="text-xs opacity-70">
              {h.boards.length === 0 ? t("noReadableBoards") : t("boardsList", { names: h.boards.map((b) => b.name).join(", ") })}
            </p>
          </li>
        ))}
      </ul>
      {full ? (
        <p className="text-xs opacity-70">{t("sitesFull", { max: MAX_SITES })}</p>
      ) : available.length === 0 ? (
        <p className="text-xs opacity-70">{t("noSitesLeft")}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("addSite")}
            <select className="rounded border px-2 py-1.5" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t("chooseSite")}</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={!choice || flight.busy} onClick={() => void add()}>
            {t("add")}
          </Button>
        </div>
      )}
      <Note message={message} />
    </div>
  );
}
