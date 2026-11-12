"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, KeyRound, Lock, Pencil, Sparkles, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { SOURCES_KEY } from "@/components/admin/admin-sources";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { HospitalGuides } from "@/components/admin/guide-library";
import { HealthLight } from "@/components/admin/health-light";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { ManualDocuments } from "@/components/admin/manual-documents";
import { LOGINS_KEY, LoginBadge, loginStateOf, useStoredLogins } from "@/components/admin/login-badge";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { adminApi, isRbaySite, loginSite, type AdminSource } from "@/lib/api/admin";
import { isManual } from "@/lib/source-health";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

// Locked fields show dots instead of the (never readable) stored value, and look inactive.
const MASK = "••••••••";
const fieldClass =
  "rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400";

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

export function AdminSource({ id }: { id: number }) {
  const t = useTranslations("admin");
  const query = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: adminApi.sources,
    refetchInterval: (q) => (q.state.data?.some((s) => s.scan_in_progress) ? 4000 : false),
  });
  const source = query.data?.find((s) => s.id === id);
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const hospital = hospitals.data?.hospitals.find((h) => h.id === source?.hospital_id);
  const guides = hospital ? <HospitalGuides hospitalId={hospital.id} hospitalName={hospital.name} /> : null;
  const placement = source && (
    <p className="text-sm">
      {hospital
        ? t("hospitals.boardOf", { name: hospital.name, kind: t(`hospitals.kinds.${source.board_kind}`) })
        : hospitals.isError
          ? adminErrorText(hospitals.error, t)
          : t("loading")}{" "}
      <Link href="/admin/hospitals" className="underline underline-offset-4">
        {t("hospitals.change")}
      </Link>
    </p>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Link href="/admin/sources" className="text-sm underline-offset-4 hover:underline">
        ← {t("sourcesTitle")}
      </Link>
      {query.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(query.error, t)}
        </p>
      )}
      {query.data && !source && <p className="text-sm">{t("sourceNotFound")}</p>}
      {source && isManual(source) && (
        <>
          <Settings source={source} />
          {placement}
          <ManualDocuments source={source} />
          <AiSwitch source={source} />
          {source.requires_login && <Members source={source} />}
          {guides}
        </>
      )}
      {source && !isManual(source) && (
        <>
          <Settings source={source} />
          {placement}
          <AiSwitch source={source} />
          {source.login_user ? <Account source={source} /> : <MakeMembersOnly source={source} />}
          {source.requires_login && <Members source={source} />}
          {guides}
        </>
      )}
    </main>
  );
}

function useRefreshSources() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
}

// ---- name, active, scan -------------------------------------------------------------------

function Settings({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const refresh = useRefreshSources();
  const flight = useSingleFlight();
  const logins = useStoredLogins([source]);
  const [name, setName] = useState(source.name);
  const [message, setMessage] = useState<Message>(null);
  const manual = isManual(source);

  async function act(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await action();
        setMessage({ kind: "ok", text: done });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <Section
      icon={Building2}
      accent="slate"
      level={1}
      title={source.name}
      aside={
        <>
          {source.requires_login ? <Badge tone="warn">{t("membersOnly")}</Badge> : <Badge>{t("public")}</Badge>}
          {manual ? (
            <Badge>{t("manual.badge")}</Badge>
          ) : (
            <LoginBadge state={loginStateOf(source, logins)} error={logins.error} />
          )}
          {!source.is_active && <Badge>{t("inactive")}</Badge>}
        </>
      }
    >
      <HealthLight source={source} />
      {manual ? (
        <p className="text-xs opacity-70">
          {source.last_scan_at
            ? t("manual.lastUpload", {
                date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
              })
            : t("manual.noUploadYet")}
        </p>
      ) : (
        <>
          <p className="break-all text-xs opacity-70">{source.url}</p>
          <p className="text-xs opacity-70">
            {source.last_scan_at
              ? t("lastScan", {
                  date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                  status: source.last_scan_status ?? "?",
                })
              : t("neverScanned")}
          </p>
        </>
      )}
      {source.scans_paused_reason && (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">
          {t("paused", { reason: source.scans_paused_reason })}
        </p>
      )}
      {source.last_scan_error && source.last_scan_status !== "ok" && (
        <p className="text-sm text-red-600">{t("scanProblem", { reason: source.last_scan_error })}</p>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => adminApi.updateSource(source.id, { name }), t("saved"));
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          {t("name")}
          <input className="rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <Button type="submit" size="sm" disabled={flight.busy || name.trim() === source.name}>
          {t("save")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={flight.busy}
          onClick={() =>
            void act(
              () => adminApi.updateSource(source.id, { is_active: !source.is_active }),
              source.is_active ? t("deactivated") : t("activated"),
            )
          }
        >
          {source.is_active ? t("deactivate") : t("activate")}
        </Button>
        {!manual && (
          <Button
            variant="outline"
            size="sm"
            disabled={flight.busy || source.scan_in_progress}
            onClick={() => void act(() => adminApi.scanSource(source.id), t("scanStarted", { name: source.name }))}
          >
            {source.scan_in_progress && <Spinner aria-hidden />}
            {source.scan_in_progress ? t("scanning") : t("scanNow")}
          </Button>
        )}
      </div>
      <Note message={message} />
    </Section>
  );
}

// ---- AI switch -----------------------------------------------------------------------------

function AiSwitch({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const refresh = useRefreshSources();
  const flight = useSingleFlight();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function set(enabled: boolean) {
    setConfirming(false);
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.updateSource(source.id, { ai_enabled: enabled });
        setMessage({ kind: "ok", text: enabled ? t("aiTurnedOn") : t("aiTurnedOff") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <Section
      icon={Sparkles}
      accent="violet"
      title={t("aiTitle")}
      aside={<Badge tone={source.ai_enabled ? "good" : "plain"}>{source.ai_enabled ? t("aiOn") : t("aiOff")}</Badge>}
    >
      <p className="text-sm opacity-80">{t("aiDescription")}</p>
      {source.ai_enabled ? (
        <div>
          <Button variant="outline" size="sm" disabled={flight.busy} onClick={() => void set(false)}>
            {t("aiTurnOff")}
          </Button>
        </div>
      ) : confirming ? (
        <div className="animate-open flex flex-wrap items-center gap-2 text-sm">
          <span>{source.requires_login ? t("aiConfirmOnStudy") : t("aiConfirmOn")}</span>
          <Button size="sm" disabled={flight.busy} onClick={() => void set(true)}>
            {t("yes")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
            {t("no")}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" disabled={flight.busy} onClick={() => setConfirming(true)}>
            {t("aiTurnOn")}
          </Button>
        </div>
      )}
      <Note message={message} />
    </Section>
  );
}

// ---- the study account (stored login) ---------------------------------------------------

function Account({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const label = source.login_user ?? "";
  const site = loginSite(source);
  const logins = useStoredLogins([source]);
  const stored = logins.data?.find((l) => l.owner_label === label && l.site === site);
  const refresh = () => queryClient.invalidateQueries({ queryKey: LOGINS_KEY });
  // A stored login is locked until "Change login" is clicked, so it cannot be replaced by a stray
  // keystroke. While the list is still loading the form stays shut too: it is not yet known
  // whether a login exists.
  const locked = Boolean(stored) && !editing;
  const waiting = Boolean(site) && logins.isLoading;
  const fieldsOff = locked || waiting;

  function cancelChange() {
    setEditing(false);
    setLoginId("");
    setPassword("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!site) return;
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.saveLogin(label, site, loginId, password);
        setMessage({ kind: "ok", text: t("loginSaved") });
        // The password is cleared as soon as it has been sent; it is never shown again. The form
        // locks again because a login is now stored.
        setLoginId("");
        setPassword("");
        setEditing(false);
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  async function remove() {
    if (!site) return;
    setConfirmingDelete(false);
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.deleteLogin(label, site);
        setMessage({ kind: "ok", text: t("loginDeleted") });
        cancelChange();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <Section icon={KeyRound} accent="amber" title={t("accountTitle")}>
      <p className="text-sm opacity-80">{t("accountIntro", { label })}</p>
      {!site && <p className="text-sm text-red-600">{t("noBoardKey")}</p>}
      {isRbaySite(site) && <p className="text-sm opacity-80">{t("rbayShared", { label })}</p>}
      {logins.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(logins.error, t)}
        </p>
      )}
      {site && logins.data && (
        <p className="text-sm">
          {stored
            ? t("loginStored", {
                date: stored.updated_at
                  ? format.dateTime(new Date(stored.updated_at), { dateStyle: "medium", timeStyle: "short" })
                  : "?",
              })
            : t("loginMissing")}
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-3" autoComplete="off">
        <label className="flex flex-col gap-1 text-sm">
          {t("loginId")}
          <input
            className={fieldClass}
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder={locked ? MASK : undefined}
            disabled={fieldsOff}
            autoComplete="off"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("password")}
          <input
            className={fieldClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={locked ? MASK : undefined}
            disabled={fieldsOff}
            autoComplete="new-password"
            required
          />
        </label>
        {locked ? (
          <p className="flex items-center gap-1.5 text-xs opacity-80">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {t("loginLockedHint")}
          </p>
        ) : (
          <p className="text-xs opacity-70">{t("passwordNote")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {locked ? (
            <Button type="button" size="sm" disabled={flight.busy} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              {t("changeLogin")}
            </Button>
          ) : (
            <>
              <Button type="submit" size="sm" disabled={flight.busy || waiting || !site} aria-busy={flight.busy}>
                {flight.busy && <Spinner aria-hidden />}
                {stored ? t("replaceLogin") : t("saveLogin")}
              </Button>
              {editing && (
                <Button type="button" size="sm" variant="outline" disabled={flight.busy} onClick={cancelChange}>
                  {t("cancelChange")}
                </Button>
              )}
            </>
          )}
          {stored &&
            (confirmingDelete ? (
              <span className="animate-open flex flex-wrap items-center gap-2">
                <span className="text-sm">{t("confirmDeleteLogin")}</span>
                <Button type="button" size="sm" disabled={flight.busy} onClick={() => void remove()}>
                  {t("yes")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                  {t("no")}
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDelete(true)}>
                {t("deleteLogin")}
              </Button>
            ))}
        </div>
      </form>
      <Note message={message} />
    </Section>
  );
}

// ---- turning a public source into a study ----------------------------------------------

function MakeMembersOnly({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const refresh = useRefreshSources();
  const flight = useSingleFlight();
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.updateSource(source.id, { login_user: label.trim() });
        setMessage({ kind: "ok", text: t("nowMembersOnly") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <Section icon={Lock} accent="amber" title={t("makeStudyTitle")}>
      <p className="text-sm opacity-80">{t("makeStudyIntro")}</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          {t("loginLabel")}
          <input
            className="rounded border px-3 py-2"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="study-1"
            autoComplete="off"
            required
          />
        </label>
        <Button type="submit" size="sm" disabled={flight.busy || !label.trim()}>
          {t("makeStudy")}
        </Button>
      </form>
      <Note message={message} />
    </Section>
  );
}

// ---- who may read a study ----------------------------------------------------------------

function Members({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const key = ["admin", "members", source.id];
  const members = useQuery({ queryKey: key, queryFn: () => adminApi.members(source.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.addMember(source.id, email);
        setEmail("");
        setMessage({ kind: "ok", text: t("memberAdded") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  async function remove(userId: string) {
    setRemoving(null);
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.removeMember(source.id, userId);
        setMessage({ kind: "ok", text: t("memberRemoved") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <Section icon={Users} accent="blue" title={t("membersTitle")}>
      <p className="text-sm opacity-80">{t("membersHint")}</p>
      {members.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {members.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(members.error, t)}
        </p>
      )}
      {members.data?.length === 0 && <p className="text-sm opacity-70">{t("noMembers")}</p>}
      <ul className="flex flex-col gap-2">
        {members.data?.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{m.email ?? m.user_id}</span>
            {m.added_at && (
              <span className="text-xs opacity-70">
                {format.dateTime(new Date(m.added_at), { dateStyle: "medium" })}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {removing === m.user_id ? (
                <span className="animate-open flex items-center gap-2">
                  <span>{t("confirmRemove")}</span>
                  <Button size="sm" disabled={flight.busy} onClick={() => void remove(m.user_id)}>
                    {t("yes")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRemoving(null)}>
                    {t("no")}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRemoving(m.user_id)}>
                  {t("removeMember")}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          {t("memberEmail")}
          <input
            className="rounded border px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <Button type="submit" size="sm" disabled={flight.busy || !email.trim()}>
          {t("addMember")}
        </Button>
      </form>
      <Note message={message} />
    </Section>
  );
}
