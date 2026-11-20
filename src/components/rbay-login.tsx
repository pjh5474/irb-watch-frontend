"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { MAX_RBAY_FIELD, type RbayLogin, rbayLoginApi, waitForTest } from "@/lib/api/rbay-login";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

// The user's own R-BAY login. The password is typed here, sent once and cleared from the screen at
// once; it is never shown again, never stored in the browser. The server tests it in the
// background (one R-BAY login) and this card polls for the result.
export function RbayLoginCard() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const send = useSingleFlight();
  const [login, setLogin] = useState<RbayLogin | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reason = useCallback(
    (error: unknown) =>
      error instanceof ApiError
        ? error.status === 0
          ? t("rbayUnreachable")
          : t("rbayFailed", { reason: error.message })
        : t("rbayUnreachable"),
    [t],
  );

  // Follows a running test to its end (also one that was already running when the page opened).
  const follow = useCallback(async (first: RbayLogin) => {
    setLogin(first);
    if (first.status !== "testing") return;
    try {
      const last = await waitForTest(first);
      if (alive.current) setLogin(last);
    } catch {
      // the next visit shows the real state; nothing is claimed here
    }
  }, []);

  useEffect(() => {
    rbayLoginApi
      .get()
      .then((row) => follow(row))
      .catch(() => alive.current && setLoadFailed(true));
  }, [follow]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const id = loginId.trim();
    if (!id || !password) return setMessage({ kind: "error", text: t("rbayNeedBoth") });
    if (id.length > MAX_RBAY_FIELD || password.length > MAX_RBAY_FIELD) {
      return setMessage({ kind: "error", text: t("rbayTooLong", { n: MAX_RBAY_FIELD }) });
    }
    await send.run(async () => {
      try {
        const sent = password;
        setPassword(""); // gone from the screen as soon as it is on its way
        setLoginId("");
        const row = await rbayLoginApi.save(id, sent);
        setEditing(false);
        await follow(row);
      } catch (error) {
        setMessage({ kind: "error", text: reason(error) });
      }
    });
  }

  async function testAgain() {
    setMessage(null);
    await send.run(async () => {
      try {
        await follow(await rbayLoginApi.test());
      } catch (error) {
        setMessage({ kind: "error", text: reason(error) });
      }
    });
  }

  async function remove() {
    setMessage(null);
    await send.run(async () => {
      try {
        await rbayLoginApi.remove();
        setConfirmDelete(false);
        setLogin(await rbayLoginApi.get());
        setMessage({ kind: "ok", text: t("rbayDeleted") });
      } catch (error) {
        setMessage({ kind: "error", text: reason(error) });
      }
    });
  }

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {t("loadError")}
      </p>
    );
  }
  if (!login) return <p className="text-sm opacity-70">{t("rbayLoading")}</p>;

  const testing = login.status === "testing";
  const showForm = !login.has_login || editing;
  const when = login.last_tested_at
    ? format.dateTime(new Date(login.last_tested_at), { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-70">{t("rbayIntro")}</p>

      {login.has_login && (
        <div className="flex flex-col gap-1 text-sm" data-testid="rbay-status">
          <p>
            {t("rbaySaved", { hint: login.login_hint ?? "" })}{" "}
            <span
              className={
                login.status === "ok"
                  ? "font-medium text-green-700 dark:text-green-400"
                  : login.status === "rejected" || login.status === "failed"
                    ? "font-medium text-red-600"
                    : "font-medium"
              }
            >
              {t(`rbayStatus.${login.status}`)}
            </span>
            {testing && <Spinner aria-hidden className="ml-2 inline-block" />}
          </p>
          {when && !testing && <p className="text-xs opacity-70">{t("rbayLastTested", { when })}</p>}
          {login.status === "rejected" && <p role="alert" className="text-red-600">{t("rbayRejectedHelp")}</p>}
          {(login.status === "rejected" || login.status === "failed") && login.last_error && (
            <p className="text-xs opacity-80">{login.last_error}</p>
          )}
          {login.status === "failed" && <p className="text-xs opacity-70">{t("rbayFailedHelp")}</p>}
        </div>
      )}

      {showForm ? (
        <form onSubmit={save} className="flex flex-col gap-3" autoComplete="off">
          <label className="flex flex-col gap-1 text-sm">
            {t("rbayId")}
            <input
              type="text"
              autoComplete="off"
              className="rounded border px-3 py-2"
              value={loginId}
              maxLength={MAX_RBAY_FIELD}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("rbayPassword")}
            <input
              type="password"
              autoComplete="new-password"
              className="rounded border px-3 py-2"
              value={password}
              maxLength={MAX_RBAY_FIELD}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className="text-xs opacity-70">{t("rbayWarning")}</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={send.busy || testing} aria-busy={send.busy}>
              {send.busy && <Spinner aria-hidden />}
              {t("rbaySave")}
            </Button>
            {login.has_login && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                {t("rbayCancel")}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={send.busy || testing || login.status === "rejected"}
            onClick={testAgain}
          >
            {t("rbayTest")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={send.busy || testing} onClick={() => setEditing(true)}>
            {t("rbayChange")}
          </Button>
          {confirmDelete ? (
            <>
              <Button type="button" size="sm" variant="destructive" disabled={send.busy} onClick={remove}>
                {t("rbayDeleteYes")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                {t("rbayCancel")}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={send.busy} onClick={() => setConfirmDelete(true)}>
              {t("rbayDelete")}
            </Button>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
