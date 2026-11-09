import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { DigestToggle } from "../src/components/digest-toggle";

// Plain functions and objects instead of vi.fn(): vitest reports a rejected promise returned by a
// spy as an unhandled error even though the component handles it.
const db = vi.hoisted(() => ({
  calls: [] as string[],
  updateRows: [{ user_id: "u-1" }] as unknown[],
  updateError: null as unknown,
  insertError: null as unknown,
  hold: null as Promise<void> | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: (column: string, value: string) => ({
          select: async () => {
            db.calls.push(`${table} update ${JSON.stringify(values)} where ${column}=${value}`);
            if (db.hold) await db.hold;
            return { data: db.updateRows, error: db.updateError };
          },
        }),
      }),
      insert: async (values: unknown) => {
        db.calls.push(`${table} insert ${JSON.stringify(values)}`);
        return { error: db.insertError };
      },
    }),
  }),
}));

function show(initial: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DigestToggle userId="u-1" initial={initial} />
    </NextIntlClientProvider>,
  );
}

const box = () => screen.getByRole("checkbox") as HTMLInputElement;

beforeEach(() => {
  db.calls.length = 0;
  db.updateRows = [{ user_id: "u-1" }];
  db.updateError = null;
  db.insertError = null;
  db.hold = null;
});
afterEach(cleanup);

describe("DigestToggle", () => {
  it("shows the saved choice", () => {
    show(true);
    expect(box().checked).toBe(true);
    cleanup();
    show(false);
    expect(box().checked).toBe(false);
  });

  it("switching off changes only digest_enabled of the user's own row", async () => {
    show(true);
    fireEvent.click(box());
    expect(await screen.findByText(/The daily digest is off/)).toBeTruthy();
    expect(db.calls).toEqual(['notification_prefs update {"digest_enabled":false} where user_id=u-1']);
    expect(box().checked).toBe(false);
  });

  it("a user without a row gets one created (update finds nothing, then insert)", async () => {
    db.updateRows = [];
    show(true);
    fireEvent.click(box());
    expect(await screen.findByText(/The daily digest is off/)).toBeTruthy();
    expect(db.calls[1]).toBe('notification_prefs insert {"user_id":"u-1","digest_enabled":false}');
  });

  it("switching back on says so", async () => {
    show(false);
    fireEvent.click(box());
    expect(await screen.findByText("The daily digest is on.")).toBeTruthy();
  });

  it("a failed save puts the checkbox back and says so", async () => {
    db.updateError = { message: "permission denied" };
    show(true);
    fireEvent.click(box());
    expect(await screen.findByText(/Could not save the change/)).toBeTruthy();
    expect(box().checked).toBe(true);
  });

  it("a failed insert also puts it back", async () => {
    db.updateRows = [];
    db.insertError = { message: "nope" };
    show(true);
    fireEvent.click(box());
    expect(await screen.findByText(/Could not save the change/)).toBeTruthy();
    expect(box().checked).toBe(true);
  });

  it("is locked while saving, so a second click cannot send a second change", async () => {
    let release: () => void = () => {};
    db.hold = new Promise<void>((resolve) => (release = resolve));
    show(true);
    fireEvent.click(box());
    expect(box().disabled).toBe(true);
    fireEvent.click(box());
    expect(db.calls).toHaveLength(1);
    await act(async () => release());
    expect(await screen.findByText(/The daily digest is off/)).toBeTruthy();
    expect(box().disabled).toBe(false);
  });
});
