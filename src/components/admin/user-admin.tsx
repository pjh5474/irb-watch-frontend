"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { ORGS_KEY } from "@/components/admin/organization-admin";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type Organization, orgApi } from "@/lib/api/organizations";
import { type AdminUser, MIN_PASSWORD, PAGE_SIZE, newUserProblem, usersApi } from "@/lib/api/users";
import { useSingleFlight } from "@/lib/use-single-flight";

export const USERS_KEY = ["admin", "users"] as const;

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

export function UserAdmin() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: [...ORGS_KEY, "list", false], queryFn: () => orgApi.list(false) });
  const [showDeleted, setShowDeleted] = useState(false);
  const [offset, setOffset] = useState(0);
  const users = useQuery({
    queryKey: [...USERS_KEY, offset, showDeleted],
    queryFn: () => usersApi.list(offset, showDeleted),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: USERS_KEY });
    await queryClient.invalidateQueries({ queryKey: ORGS_KEY });
  }

  const total = users.data?.total ?? 0;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <Section icon={Users} accent="violet" level={1} title={t("users.title")}>
        <p className="text-sm opacity-80">{t("users.intro")}</p>
      </Section>

      <CreateUser orgs={orgs.data ?? []} onCreated={refresh} />

      <Section icon={Users} accent="slate" title={t("users.listTitle")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => {
              setShowDeleted(e.target.checked);
              setOffset(0);
            }}
          />
          {t("users.showDeleted")}
        </label>
        {users.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {users.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(users.error, t)}
          </p>
        )}
        <ul className="flex flex-col divide-y">
          {(users.data?.items ?? []).map((u) => (
            <UserRow key={u.id} user={u} orgs={orgs.data ?? []} onChanged={refresh} />
          ))}
        </ul>
        {total > PAGE_SIZE && (
          <div className="flex items-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              {t("users.prev")}
            </Button>
            <span>{t("users.range", { from: offset + 1, to: Math.min(offset + PAGE_SIZE, total), total })}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t("users.next")}
            </Button>
          </div>
        )}
      </Section>
    </main>
  );
}

function CreateUser({ orgs, onCreated }: { orgs: Organization[]; onCreated: () => Promise<void> }) {
  const t = useTranslations("admin");
  const send = useSingleFlight();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [org, setOrg] = useState("");
  const [message, setMessage] = useState<Message>(null);
  // Default is preselected; an empty choice also means Default on the server.
  const defaultId = orgs.find((o) => o.is_default)?.id ?? "";
  const chosen = org || defaultId;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const body = {
      email: email.trim(),
      password,
      display_name: name.trim() || null,
      role,
      organization_id: chosen || null,
    };
    const problem = newUserProblem(body);
    if (problem === "email") return setMessage({ kind: "error", text: t("users.badEmail") });
    if (problem === "password") return setMessage({ kind: "error", text: t("users.shortPassword", { n: MIN_PASSWORD }) });
    await send.run(async () => {
      try {
        const user = await usersApi.create(body);
        setEmail("");
        setName("");
        setPassword("");
        setRole("user");
        setMessage({
          kind: "ok",
          text: t("users.created", { email: user.email ?? body.email, org: user.organization_name ?? "-" }),
        });
        await onCreated();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
        // A user made in Default whose move failed exists now: show it in the list.
        await onCreated();
      }
    });
  }

  return (
    <Section icon={UserPlus} accent="blue" title={t("users.createTitle")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("users.email")}
          <input
            type="email"
            autoComplete="off"
            className="rounded border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("users.displayName")}
          <input className="rounded border px-3 py-2" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="new-user-password">{t("users.password")}</label>
          <input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            aria-describedby="new-user-password-hint"
            className="rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span id="new-user-password-hint" className="text-xs opacity-70">
            {t("users.passwordHint", { n: MIN_PASSWORD })}
          </span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t("users.organization")}
          <select className="rounded border px-3 py-2" value={chosen} onChange={(e) => setOrg(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("users.role")}
          <select
            className="rounded border px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "user")}
          >
            <option value="user">{t("users.roleUser")}</option>
            <option value="admin">{t("users.roleAdmin")}</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={send.busy} aria-busy={send.busy}>
            {send.busy && <Spinner aria-hidden />}
            {t("users.create")}
          </Button>
        </div>
      </form>
      <Note message={message} />
    </Section>
  );
}

function UserRow({ user, orgs, onChanged }: { user: AdminUser; orgs: Organization[]; onChanged: () => Promise<void> }) {
  const t = useTranslations("admin");
  const action = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [target, setTarget] = useState("");
  const deleted = user.deleted_at !== null;
  const others = orgs.filter((o) => o.id !== user.organization_id);

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

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{user.email ?? user.id}</span>
        {user.display_name && <span className="opacity-70">({user.display_name})</span>}
        {user.role === "admin" && <Badge>{t("users.roleAdmin")}</Badge>}
        {deleted && <Badge tone="warn">{t("users.deleted")}</Badge>}
        <span className="opacity-70">{user.organization_name ?? "-"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!deleted && (
          <Button
            size="sm"
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              act(
                () => usersApi.setRole(user.id, user.role === "admin" ? "user" : "admin"),
                user.role === "admin" ? t("users.demoted") : t("users.promoted"),
              )
            }
          >
            {user.role === "admin" ? t("users.makeUser") : t("users.makeAdmin")}
          </Button>
        )}
        {!deleted && !confirmDelete && (
          <Button size="sm" variant="outline" disabled={action.busy} onClick={() => setConfirmDelete(true)}>
            {t("users.delete")}
          </Button>
        )}
        {!deleted && confirmDelete && (
          <>
            <Button
              size="sm"
              disabled={action.busy}
              onClick={() => act(() => usersApi.remove(user.id), t("users.deletedDone"))}
            >
              {t("users.confirmDelete")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("users.cancel")}
            </Button>
          </>
        )}
        {deleted && (
          <Button size="sm" variant="outline" disabled={action.busy} onClick={() => act(() => usersApi.restore(user.id), t("users.restored"))}>
            {t("users.restore")}
          </Button>
        )}
        {others.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <label className="sr-only" htmlFor={`user-move-${user.id}`}>
              {t("orgs.moveTo")}
            </label>
            <select
              id={`user-move-${user.id}`}
              className="rounded border px-2 py-1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t("orgs.moveTo")}</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={action.busy}
              onClick={() => {
                if (!target) return setMessage({ kind: "error", text: t("orgs.pickTarget") });
                const name = others.find((o) => o.id === target)?.name ?? "";
                return act(() => usersApi.move(user.id, target), t("orgs.moved", { email: user.email ?? user.id, name }));
              }}
            >
              {t("orgs.move")}
            </Button>
          </span>
        )}
      </div>
      <Note message={message} />
    </li>
  );
}
