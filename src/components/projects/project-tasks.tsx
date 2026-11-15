"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { sitesKey } from "@/components/pipelines/project-pipelines";
import { errorText } from "@/components/pipelines/shared";
import { useProjectAccess } from "@/components/projects/project-access";
import { Button } from "@/components/ui/button";
import { type ProjectTask, type TaskInput, taskApi, timeLabel } from "@/lib/api/calendar";
import { daysUntil, todaySeoul } from "@/lib/api/pipelines";
import { siteApi, siteLabel } from "@/lib/api/sites";
import { useSingleFlight } from "@/lib/use-single-flight";

export const tasksKey = (projectId: number) => ["tasks", projectId] as const;

/**
 * A project's tasks (CAL-1): dated items that are not IRB steps (an internal review day, a
 * sponsor meeting). Read access sees them; edit access adds, ticks off and removes them. The
 * calendar and the daily reminder mail show them too.
 */
export function ProjectTasks({ projectId }: { projectId: number }) {
  const t = useTranslations("tasks");
  const tp = useTranslations("pipelines");
  const { canEdit, sharing } = useProjectAccess();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const tasks = useQuery({ queryKey: [...tasksKey(projectId), showRemoved], queryFn: () => taskApi.list(projectId, showRemoved) });
  const sites = useQuery({ queryKey: [...sitesKey(projectId), false], queryFn: () => siteApi.list(projectId, false) });
  const people = [
    ...(sharing?.owner ? [sharing.owner] : []),
    ...(sharing?.members ?? []).filter((m) => m.in_organization).map((m) => m.user),
  ];
  const today = todaySeoul();

  async function run(work: () => Promise<unknown>, ok: string | null, after?: () => void) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        if (ok) setMessage({ kind: "ok", text: ok });
        after?.();
        await queryClient.invalidateQueries({ queryKey: tasksKey(projectId) });
        await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, tp) });
      }
    });
  }

  const rows = tasks.data ?? [];
  const open = rows.filter((x) => !x.done && !x.deleted_at);
  const done = rows.filter((x) => x.done && !x.deleted_at);
  const removed = rows.filter((x) => x.deleted_at);

  return (
    <div className="flex flex-col gap-3">
      {tasks.isLoading && <p className="text-sm opacity-70">{tp("loading")}</p>}
      {tasks.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorText(tasks.error, tp)}
        </p>
      )}
      {tasks.data && open.length === 0 && done.length === 0 && <p className="text-sm opacity-70">{t("none")}</p>}
      <ul className="flex flex-col gap-2">
        {open.map((task) => (
          <TaskRow key={task.id} task={task} today={today} canEdit={canEdit} busy={flight.busy} run={run} />
        ))}
      </ul>
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer opacity-80">{t("doneCount", { n: done.length })}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} today={today} canEdit={canEdit} busy={flight.busy} run={run} />
            ))}
          </ul>
        </details>
      )}
      {showRemoved && removed.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {removed.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-2 rounded border border-dashed p-2 opacity-80">
              <span className="line-through">{task.title}</span>
              <span className="text-xs">{task.due_on}</span>
              {canEdit && (
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void run(() => taskApi.restore(task.id), t("restored"))}>
                  {t("restore")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button size="sm" variant="outline" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            {t("add")}
          </Button>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
          {t("showRemoved")}
        </label>
      </div>
      {adding && canEdit && (
        <TaskForm
          people={people}
          sites={(sites.data ?? []).filter((s) => !s.deleted_at).map((s) => ({ id: s.id, label: siteLabel(s) || t("unnamedSite") }))}
          busy={flight.busy}
          onCancel={() => setAdding(false)}
          onSubmit={(body) => void run(() => taskApi.create(projectId, body), t("added"), () => setAdding(false))}
        />
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function TaskRow({
  task,
  today,
  canEdit,
  busy,
  run,
}: {
  task: ProjectTask;
  today: string;
  canEdit: boolean;
  busy: boolean;
  run: (work: () => Promise<unknown>, ok: string | null) => Promise<void>;
}) {
  const t = useTranslations("tasks");
  const left = daysUntil(task.due_on, today);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={task.done}
          disabled={!canEdit || busy}
          aria-label={task.done ? t("markOpen") : t("markDone")}
          onChange={(e) => void run(() => taskApi.update(task.id, { done: e.target.checked }), null)}
        />
        <span className={task.done ? "line-through opacity-70" : "font-medium"}>{task.title}</span>
      </label>
      <span className="text-xs tabular-nums">
        {task.due_on}
        {task.due_at ? ` ${timeLabel(task.due_at)}` : ""}
      </span>
      {!task.done && left < 0 && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">{t("overdue", { n: -left })}</span>}
      {!task.done && left >= 0 && left <= 14 && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{t("dueIn", { n: left })}</span>}
      {task.assignee_name && <span className="text-xs opacity-70">{t("assignee", { name: task.assignee_name })}</span>}
      {task.note && <span className="w-full text-xs whitespace-pre-wrap opacity-80">{task.note}</span>}
      {canEdit && (
        <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => void run(() => taskApi.remove(task.id), t("removed"))}>
          {t("remove")}
        </Button>
      )}
    </li>
  );
}

function TaskForm({
  people,
  sites,
  busy,
  onSubmit,
  onCancel,
}: {
  people: { id: string; name: string }[];
  sites: { id: number; label: string }[];
  busy: boolean;
  onSubmit: (body: TaskInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("tasks");
  const [v, setV] = useState({ title: "", due_on: todaySeoul(), due_at: "", note: "", assignee_id: "", site_id: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((old) => ({ ...old, [k]: e.target.value }));
  return (
    <form
      className="flex flex-col gap-2 rounded border p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim() || !v.due_on) return;
        onSubmit({
          title: v.title.trim(),
          due_on: v.due_on,
          due_at: v.due_at || null,
          note: v.note.trim(),
          assignee_id: v.assignee_id || null,
          site_id: v.site_id ? Number(v.site_id) : null,
        });
      }}
    >
      <label className="flex flex-col gap-1">
        {t("title")}
        <input required maxLength={200} className="rounded border px-2 py-1" value={v.title} onChange={set("title")} placeholder={t("titleHint")} />
      </label>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          {t("date")}
          <input type="date" required className="rounded border px-2 py-1" value={v.due_on} onChange={set("due_on")} />
        </label>
        <label className="flex flex-col gap-1">
          {t("time")}
          <input type="time" className="rounded border px-2 py-1" value={v.due_at} onChange={set("due_at")} />
        </label>
        <label className="flex flex-col gap-1">
          {t("assigneeLabel")}
          <select className="rounded border px-2 py-1" value={v.assignee_id} onChange={set("assignee_id")}>
            <option value="">{t("noAssignee")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {sites.length > 0 && (
          <label className="flex flex-col gap-1">
            {t("site")}
            <select className="rounded border px-2 py-1" value={v.site_id} onChange={set("site_id")}>
              <option value="">{t("noSite")}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        {t("note")}
        <textarea rows={2} maxLength={4000} className="rounded border px-2 py-1" value={v.note} onChange={set("note")} />
      </label>
      <p className="text-xs opacity-70">{t("reminderHint")}</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t("save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
