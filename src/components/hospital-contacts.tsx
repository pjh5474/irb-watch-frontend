"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONTACT_COLUMNS,
  CONTACT_FIELDS,
  type ContactField,
  type ContactsRow,
  contactsApi,
  shownField,
  staffGroups,
} from "@/lib/api/contacts";
import { createClient } from "@/lib/supabase/client";
import { useSingleFlight } from "@/lib/use-single-flight";

export const contactsKey = (hospitalId: number) => ["hospital-contacts", hospitalId] as const;

/**
 * A hospital's IRB office contacts: phone, fax and email as the hospital wrote them on R-BAY (or
 * typed by an admin, which wins and is never overwritten by a scan), and the people by task from
 * the hospital's manager page. Every signed-in user reads them (table hospital_contacts); only an
 * admin edits. The text is plain text: it is never turned into a link or markup, because the
 * hospitals write anything in these fields ("_", "DRB", "(평일 08:30 ~ 17:30)").
 */
export function HospitalContacts({ hospitalId, canEdit = false }: { hospitalId: number; canEdit?: boolean }) {
  const t = useTranslations("hospitalPage.contacts");
  const format = useFormatter();
  const row = useQuery({
    queryKey: contactsKey(hospitalId),
    queryFn: async (): Promise<ContactsRow | null> => {
      const { data, error } = await createClient()
        .from("hospital_contacts")
        .select(CONTACT_COLUMNS)
        .eq("hospital_id", hospitalId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ContactsRow | null;
    },
  });
  const [editing, setEditing] = useState(false);
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  if (row.isError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {t("loadError")}
      </p>
    );
  }
  if (row.isPending) return <div className="h-24 animate-pulse rounded border bg-neutral-100 dark:bg-neutral-800" aria-busy="true" />;

  const data = row.data;
  const reason = (kind: string | null) => t(`reason.${kind ?? "other"}` as "reason.other");
  const groups = staffGroups(data?.staff);

  let status: React.ReactNode;
  if (!data || data.check_status === "never") status = <p className="text-xs opacity-70">{t("neverChecked")}</p>;
  else if (data.check_status === "failed") {
    status = (
      <p role="status" className="rounded border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        {data.last_ok_at
          ? t("failed", { reason: reason(data.error_kind), date: when(data.last_ok_at) })
          : t("failedNever", { reason: reason(data.error_kind) })}
      </p>
    );
  } else status = <p className="text-xs opacity-70">{data.checked_at ? t("checked", { date: when(data.checked_at) }) : null}</p>;

  return (
    <section aria-labelledby="contacts-title" className="flex flex-col gap-3 rounded border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="contacts-title" className="font-medium">
          {t("title")}
        </h2>
        {canEdit && !editing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        )}
      </div>
      {status}

      {editing ? (
        <ContactsEditor hospitalId={hospitalId} row={data} onDone={() => setEditing(false)} />
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {CONTACT_FIELDS.map((field) => {
            const shown = shownField(data, field);
            return (
              <div key={field} className="min-w-0">
                <dt className="text-xs font-medium opacity-70">{t(field)}</dt>
                <dd className="mt-1 whitespace-pre-line break-words">
                  {shown.text ? shown.text : <span className="opacity-60">{t("none")}</span>}
                  {shown.from === "admin" && <span className="mt-1 block text-xs opacity-60">{t("typedByAdmin")}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {data?.staff_status === "none" && groups.length === 0 && <p className="text-xs opacity-60">{t("staffNone")}</p>}
      {data?.staff_status === "failed" && (
        <p role="status" className="rounded border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {t("staffFailed", { reason: reason(data.staff_error_kind) })}
        </p>
      )}
      {groups.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t("staffTitle")}</summary>
          <div className="mt-3 flex flex-col gap-4">
            {groups.map((g, i) => (
              <div key={`${g.tab}-${i}`}>
                {g.tab && <h3 className="mb-1 text-xs font-medium opacity-70">{g.tab}</h3>}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-xs">
                    <thead>
                      <tr className="border-b opacity-70">
                        <th className="py-1 pr-3 font-medium">{t("staffColTask")}</th>
                        <th className="py-1 pr-3 font-medium">{t("staffColName")}</th>
                        <th className="py-1 pr-3 font-medium">{t("staffColEmail")}</th>
                        <th className="py-1 font-medium">{t("staffColTel")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.entries.map((e, j) => (
                        <tr key={j} className="border-b align-top last:border-0">
                          <td className="py-1.5 pr-3 break-words">{e.title}</td>
                          <td className="py-1.5 pr-3 break-words">{e.name}</td>
                          <td className="py-1.5 pr-3 break-all">{e.email}</td>
                          <td className="py-1.5 break-words">{e.tel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** The contacts behind a button, for pages that are about something else (a pipeline): nothing is
 * read from the database until the user opens it. */
export function ContactsToggle({ hospitalId }: { hospitalId: number }) {
  const t = useTranslations("hospitalPage.contacts");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("hide") : t("show")}
        </Button>
      </div>
      {open && <HospitalContacts hospitalId={hospitalId} />}
    </div>
  );
}

function ContactsEditor({ hospitalId, row, onDone }: { hospitalId: number; row: ContactsRow | null; onDone: () => void }) {
  const t = useTranslations("hospitalPage.contacts");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [values, setValues] = useState<Record<ContactField, string>>({
    phone: row?.manual_phone ?? "",
    fax: row?.manual_fax ?? "",
    email: row?.manual_email ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    await flight.run(async () => {
      try {
        // A blank field clears the typed text, so the R-BAY text shows again.
        await contactsApi.save(hospitalId, { phone: values.phone, fax: values.fax, email: values.email });
        await queryClient.invalidateQueries({ queryKey: contactsKey(hospitalId) });
        onDone();
      } catch (e) {
        setError(t("saveFailed", { reason: e instanceof Error ? e.message : "?" }));
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 text-sm">
      <p className="text-xs opacity-70">{t("editHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CONTACT_FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1">
            {t(field)}
            <textarea
              rows={4}
              maxLength={500}
              className="rounded border px-2 py-1.5"
              value={values[field]}
              placeholder={row?.[`scanned_${field}`] ?? ""}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={flight.busy} aria-busy={flight.busy}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
