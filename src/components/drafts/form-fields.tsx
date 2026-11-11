"use client";

import { useTranslations } from "next-intl";
import { MAX_ANSWER_CHARS, pickedOf, type Answers, type FormField } from "@/lib/api/docgen";

// A form's fields: a short read-only list (what the server found), and the editor of a
// template draft (one box per text field, tick boxes for choices).

export function FieldList({ fields }: { fields: FormField[] }) {
  const t = useTranslations("drafts");
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
      {fields.map((f) => (
        <li key={f.key} className="flex flex-wrap gap-x-2">
          <span className="font-medium break-words">{f.label}</span>
          <span className="text-xs opacity-60">
            {f.kind === "choice" ? t("form.choiceOf", { options: f.options.join(" / ") }) : t("form.textField")}
          </span>
          {f.source === "marker" && <span className="text-xs opacity-60">{t("form.marker")}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Toggle one option of a tick-box answer (only one unless several are allowed). */
export function toggleOption(field: FormField, current: string[], option: string, on: boolean): string[] {
  if (!on) return current.filter((o) => o !== option);
  if (!field.multi) return [option];
  // Keep the form's order.
  return field.options.filter((o) => o === option || current.includes(o));
}

export function FieldEditor({
  fields,
  values,
  readOnly,
  onChange,
}: {
  fields: FormField[];
  values: Answers;
  readOnly: boolean;
  onChange: (next: Answers) => void;
}) {
  const t = useTranslations("drafts");
  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => {
        const id = `field-${f.key}`;
        if (f.kind === "choice") {
          const picked = pickedOf(values[f.key]);
          return (
            <fieldset key={f.key} className="flex flex-col gap-1 rounded border p-2 text-sm">
              <legend className="px-1 font-medium break-words">{f.label}</legend>
              {f.hint && <p className="text-xs opacity-70">{f.hint}</p>}
              <div className="flex flex-wrap gap-3">
                {f.options.map((o) => (
                  <label key={o} className="flex items-center gap-1">
                    <input
                      type={f.multi ? "checkbox" : "radio"}
                      name={id}
                      checked={picked.includes(o)}
                      disabled={readOnly}
                      onChange={(e) => onChange({ ...values, [f.key]: toggleOption(f, picked, o, e.target.checked) })}
                    />
                    {o}
                  </label>
                ))}
                {!f.multi && !readOnly && picked.length > 0 && (
                  <button type="button" className="text-xs underline" onClick={() => onChange({ ...values, [f.key]: [] })}>
                    {t("form.clearChoice")}
                  </button>
                )}
              </div>
            </fieldset>
          );
        }
        const value = values[f.key];
        const text = typeof value === "string" ? value : "";
        return (
          <label key={f.key} htmlFor={id} className="flex flex-col gap-1 text-sm">
            <span className="font-medium break-words">{f.label}</span>
            {f.hint && <span className="text-xs opacity-70">{f.hint}</span>}
            <textarea
              id={id}
              className="min-h-16 rounded border p-2 text-sm"
              rows={Math.min(8, Math.max(2, text.split("\n").length))}
              value={text}
              readOnly={readOnly}
              aria-invalid={text.length > MAX_ANSWER_CHARS}
              placeholder={value === undefined ? t("form.unanswered") : undefined}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
            {text.length > MAX_ANSWER_CHARS && (
              <span className="text-xs text-red-600">{t("chars", { n: text.length, max: MAX_ANSWER_CHARS })}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
