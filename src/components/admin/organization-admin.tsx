"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Building2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  METRICS,
  type Counts,
  type Organization,
  currentMonth,
  orgApi,
} from "@/lib/api/organizations";
import { useSingleFlight } from "@/lib/use-single-flight";

export const ORGS_KEY = ["admin", "organizations"] as const;

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

export function OrganizationAdmin() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const orgs = useQuery({ queryKey: [...ORGS_KEY, "list", showDeleted], queryFn: () => orgApi.list(showDeleted) });
  // Move targets: live organizations only, whatever the list shows.
  const live = useQuery({ queryKey: [...ORGS_KEY, "list", false], queryFn: () => orgApi.list(false) });

  const create = useSingleFlight();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ORGS_KEY });
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!name.trim()) return setMessage({ kind: "error", text: t("orgs.needName") });
    await create.run(async () => {
      try {
        const org = await orgApi.create(name.trim());
        setName("");
        setMessage({ kind: "ok", text: t("orgs.created", { name: org.name }) });
        await refresh();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <Section icon={Building2} accent="violet" level={1} title={t("orgs.title")}>
        <p className="text-sm opacity-80">{t("orgs.intro")}</p>
      </Section>

      <MonthlyStats />

      <Section icon={Plus} accent="blue" title={t("orgs.addTitle")}>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            {t("orgs.name")}
            <input
              className="rounded border px-3 py-2"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" disabled={create.busy} aria-busy={create.busy}>
            {create.busy && <Spinner aria-hidden />}
            {t("orgs.add")}
          </Button>
        </form>
        <Note message={message} />
      </Section>

      <Section icon={Building2} accent="slate" title={t("orgs.listTitle")}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          {t("orgs.showDeleted")}
        </label>
        {orgs.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {orgs.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(orgs.error, t)}
          </p>
        )}
        <ul className="flex flex-col divide-y">
          {(orgs.data ?? []).map((org) => (
            <OrgRow key={org.id} org={org} targets={live.data ?? []} onChanged={refresh} />
          ))}
        </ul>
      </Section>
    </main>
  );
}

function OrgRow({
  org,
  targets,
  onChanged,
}: {
  org: Organization;
  targets: Organization[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const action = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(org.name);
  const [open, setOpen] = useState(false);
  const deleted = org.deleted_at !== null;

  async function act(work: () => Promise<unknown>, ok: string) {
    setMessage(null);
    await action.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return setMessage({ kind: "error", text: t("orgs.needName") });
    await act(async () => {
      await orgApi.rename(org.id, newName.trim());
      setRenaming(false);
    }, t("orgs.renamed"));
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{org.name}</span>
        {org.is_default && <Badge>{t("orgs.default")}</Badge>}
        {deleted && <Badge>{t("orgs.deleted")}</Badge>}
        <span className="text-sm opacity-70">{t("orgs.memberCount", { n: org.member_count })}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t("orgs.hideMembers") : t("orgs.showMembers")}
          </Button>
          {!deleted && (
            <Button size="sm" variant="outline" onClick={() => setRenaming((v) => !v)} disabled={action.busy}>
              {t("orgs.rename")}
            </Button>
          )}
          {!deleted && !org.is_default && (
            <Button
              size="sm"
              variant="outline"
              disabled={action.busy}
              onClick={() => act(() => orgApi.remove(org.id), t("orgs.deletedDone"))}
            >
              {t("orgs.delete")}
            </Button>
          )}
          {deleted && (
            <Button
              size="sm"
              variant="outline"
              disabled={action.busy}
              onClick={() => act(() => orgApi.restore(org.id), t("orgs.restored"))}
            >
              {t("orgs.restore")}
            </Button>
          )}
        </span>
      </div>
      {renaming && (
        <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            {t("orgs.newName")}
            <input
              className="rounded border px-3 py-1.5"
              value={newName}
              maxLength={200}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" disabled={action.busy}>
            {t("orgs.save")}
          </Button>
        </form>
      )}
      <Note message={message} />
      {open && <Members org={org} targets={targets} onChanged={onChanged} />}
    </li>
  );
}

function Members({
  org,
  targets,
  onChanged,
}: {
  org: Organization;
  targets: Organization[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const members = useQuery({ queryKey: [...ORGS_KEY, "members", org.id], queryFn: () => orgApi.members(org.id) });
  const others = targets.filter((o) => o.id !== org.id);
  const move = useSingleFlight();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);

  async function moveUser(userId: string, email: string | null) {
    const target = picked[userId];
    if (!target) return setMessage({ kind: "error", text: t("orgs.pickTarget") });
    setMessage(null);
    await move.run(async () => {
      try {
        await orgApi.moveUser(userId, target);
        const name = others.find((o) => o.id === target)?.name ?? "";
        setMessage({ kind: "ok", text: t("orgs.moved", { email: email ?? userId, name }) });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  if (members.isLoading) return <p className="text-sm opacity-70">{t("loading")}</p>;
  if (members.isError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {adminErrorText(members.error, t)}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded bg-neutral-50 p-3 dark:bg-neutral-900">
      {members.data?.length === 0 && <p className="text-sm opacity-70">{t("orgs.noMembers")}</p>}
      <ul className="flex flex-col gap-2">
        {(members.data ?? []).map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{m.email ?? m.user_id}</span>
            {m.display_name && <span className="opacity-70">({m.display_name})</span>}
            {m.role === "admin" && <Badge>{t("orgs.platformAdmin")}</Badge>}
            {m.deleted_at && <Badge>{t("orgs.deletedUser")}</Badge>}
            {others.length > 0 && (
              <span className="ml-auto flex items-center gap-1">
                <label className="sr-only" htmlFor={`move-${m.user_id}`}>
                  {t("orgs.moveTo")}
                </label>
                <select
                  id={`move-${m.user_id}`}
                  className="rounded border px-2 py-1"
                  value={picked[m.user_id] ?? ""}
                  onChange={(e) => setPicked((p) => ({ ...p, [m.user_id]: e.target.value }))}
                >
                  <option value="">{t("orgs.moveTo")}</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={move.busy} onClick={() => moveUser(m.user_id, m.email)}>
                  {t("orgs.move")}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <Note message={message} />
    </div>
  );
}

function CountCells({ counts }: { counts: Counts }) {
  return (
    <>
      {METRICS.map((m) => (
        <td key={m} className="px-2 py-1 text-right tabular-nums">
          {counts[m]}
        </td>
      ))}
    </>
  );
}

function MonthlyStats() {
  const t = useTranslations("admin");
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}$/.test(month) && month <= thisMonth;
  const stats = useQuery({
    queryKey: [...ORGS_KEY, "stats", month],
    queryFn: () => orgApi.monthStats(month),
    enabled: valid,
  });
  const detail = useQuery({
    queryKey: [...ORGS_KEY, "stats", month, selected],
    queryFn: () => orgApi.orgStats(selected as string, month),
    enabled: valid && selected !== null,
  });

  return (
    <Section icon={BarChart3} accent="amber" title={t("orgs.statsTitle")}>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          {t("orgs.month")}
          <input
            type="month"
            className="rounded border px-2 py-1.5"
            value={month}
            max={thisMonth}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs opacity-70">{t("orgs.statsNote")}</p>
      {!valid && (
        <p role="alert" className="text-sm text-red-600">
          {t("orgs.badMonth")}
        </p>
      )}
      {stats.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {stats.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(stats.error, t)}
        </p>
      )}
      {stats.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-1">{t("orgs.organization")}</th>
                <th className="px-2 py-1 text-right">{t("orgs.col.members")}</th>
                <th className="px-2 py-1 text-right">{t("orgs.col.newAccounts")}</th>
                <th className="px-2 py-1 text-right">{t("orgs.col.signedIn")}</th>
                {METRICS.map((m) => (
                  <th key={m} className="px-2 py-1 text-right">
                    {t(`orgs.metric.${m}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.data.organizations.map((row) => (
                <tr key={row.organization_id} className="border-b">
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      aria-pressed={selected === row.organization_id}
                      onClick={() => setSelected((s) => (s === row.organization_id ? null : row.organization_id))}
                    >
                      {row.name}
                    </button>
                    {row.deleted && <span className="ml-1 text-xs opacity-70">({t("orgs.deleted")})</span>}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{row.members}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{row.new_accounts}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{row.signed_in}</td>
                  <CountCells counts={row.counts} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && detail.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {selected && detail.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(detail.error, t)}
        </p>
      )}
      {selected && detail.data && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">{t("orgs.perUser", { name: detail.data.organization.name })}</h3>
          {detail.data.users.length === 0 ? (
            <p className="text-sm opacity-70">{t("orgs.noUsers")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1">{t("orgs.user")}</th>
                    <th className="px-2 py-1">{t("orgs.col.lastSignIn")}</th>
                    {METRICS.map((m) => (
                      <th key={m} className="px-2 py-1 text-right">
                        {t(`orgs.metric.${m}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.data.users.map((u) => (
                    <tr key={u.user_id} className="border-b">
                      <td className="px-2 py-1">
                        {u.email ?? u.user_id}
                        {!u.member_now && <span className="ml-1 text-xs opacity-70">({t("orgs.notMemberNow")})</span>}
                      </td>
                      <td className="px-2 py-1">{u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : "-"}</td>
                      <CountCells counts={u.counts} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
