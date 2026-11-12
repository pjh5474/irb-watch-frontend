"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hospital, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SOURCES_KEY } from "@/components/admin/admin-sources";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type AdminHospital, type BoardKind, type HospitalBoard, adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

export const HOSPITALS_KEY = ["admin", "hospitals"] as const;

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

// The hospital catalog (owner, 2026-11-12): a hospital groups its boards. Projects, IRB
// pipelines, guides and forms are kept per hospital. An admin creates and renames hospitals and
// moves a board to another hospital or changes its kind. Every user sees the hospital names.
export function HospitalAdmin() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const create = useSingleFlight();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: HOSPITALS_KEY }),
      queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
    ]);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!name.trim()) return setMessage({ kind: "error", text: t("hospitals.needName") });
    await create.run(async () => {
      try {
        const h = await adminApi.createHospital({ name: name.trim() });
        setName("");
        setMessage({ kind: "ok", text: t("hospitals.created", { name: h.name }) });
        await refresh();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const hospitals = list.data?.hospitals ?? [];
  const kinds = list.data?.board_kinds ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <Section icon={Hospital} accent="violet" level={1} title={t("hospitals.title")}>
        <p className="text-sm opacity-80">{t("hospitals.intro")}</p>
      </Section>

      <Section icon={Plus} accent="blue" title={t("hospitals.addTitle")}>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            {t("hospitals.name")}
            <input
              className="rounded border px-3 py-2"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" disabled={create.busy} aria-busy={create.busy}>
            {create.busy && <Spinner aria-hidden />}
            {t("hospitals.add")}
          </Button>
        </form>
        <Note message={message} />
      </Section>

      <Section icon={Hospital} accent="slate" title={t("hospitals.listTitle", { n: hospitals.length })}>
        {list.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {list.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(list.error, t)}
          </p>
        )}
        <ul className="flex flex-col divide-y">
          {hospitals.map((h) => (
            <HospitalRow key={h.id} hospital={h} all={hospitals} kinds={kinds} onChanged={refresh} />
          ))}
        </ul>
      </Section>
    </main>
  );
}

function HospitalRow({
  hospital,
  all,
  kinds,
  onChanged,
}: {
  hospital: AdminHospital;
  all: AdminHospital[];
  kinds: BoardKind[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(hospital.name);
  const [note, setNote] = useState(hospital.note);
  const [message, setMessage] = useState<Message>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!name.trim()) return setMessage({ kind: "error", text: t("hospitals.needName") });
    await flight.run(async () => {
      try {
        await adminApi.updateHospital(hospital.id, { name: name.trim(), note: note.trim() });
        setEditing(false);
        setMessage({ kind: "ok", text: t("hospitals.saved") });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("hospitals.name")}
            <input className="rounded border px-3 py-2" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("hospitals.note")}
            <textarea className="min-h-16 rounded border px-3 py-2" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={flight.busy} aria-busy={flight.busy}>
              {flight.busy && <Spinner aria-hidden />}
              {t("hospitals.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(hospital.name);
                setNote(hospital.note);
              }}
            >
              {t("hospitals.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 font-medium">{hospital.name}</span>
          <span className="text-xs opacity-70">{t("hospitals.boardCount", { n: hospital.boards.length })}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t("hospitals.edit")}
          </Button>
        </div>
      )}
      {!editing && hospital.note && <p className="text-xs whitespace-pre-wrap opacity-70">{hospital.note}</p>}
      {hospital.boards.length === 0 ? (
        <p className="text-xs opacity-70">{t("hospitals.noBoards")}</p>
      ) : (
        <ul className="flex flex-col gap-1 pl-3">
          {hospital.boards.map((b) => (
            <BoardRow key={b.id} board={b} hospitalId={hospital.id} all={all} kinds={kinds} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <Note message={message} />
    </li>
  );
}

function BoardRow({
  board,
  hospitalId,
  all,
  kinds,
  onChanged,
}: {
  board: HospitalBoard;
  hospitalId: number;
  all: AdminHospital[];
  kinds: BoardKind[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);

  async function change(body: { hospital_id?: number; board_kind?: BoardKind }, done: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await adminApi.updateSource(board.id, body);
        setMessage({ kind: "ok", text: done });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex-1 ${board.is_active ? "" : "opacity-60"}`}>
          {board.name}
          {!board.is_active && ` · ${t("hospitals.inactive")}`}
        </span>
        <label className="flex items-center gap-1 text-xs">
          {t("hospitals.kind")}
          <select
            className="rounded border px-1.5 py-1"
            value={board.board_kind}
            disabled={flight.busy}
            onChange={(e) => void change({ board_kind: e.target.value as BoardKind }, t("hospitals.kindSaved"))}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`hospitals.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          {t("hospitals.moveTo")}
          <select
            className="max-w-48 rounded border px-1.5 py-1"
            value={hospitalId}
            disabled={flight.busy}
            onChange={(e) => void change({ hospital_id: Number(e.target.value) }, t("hospitals.moved"))}
          >
            {all.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {flight.busy && <Spinner aria-hidden />}
      </div>
      <Note message={message} />
    </li>
  );
}
