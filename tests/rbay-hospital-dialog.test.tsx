import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AddSourceDialog } from "../src/components/admin/add-source-dialog";

const state = vi.hoisted(() => ({ calls: [] as unknown[], fail: null as Error | null }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    hospitals: async () => ({ hospitals: [], board_kinds: ["notice", "forms", "regulations", "other"] }),
    createRbayHospital: async (body: unknown) => {
      if (state.fail) throw state.fail;
      state.calls.push(body);
      return { hospital_id: 1, hospital_made: true, sources: [{}, {}, {}] };
    },
  },
}));

function open(onAdded = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QueryClientProvider client={client}>
        <AddSourceDialog onClose={() => {}} onAdded={onAdded} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByLabelText(/An R-BAY hospital/));
  return onAdded;
}

function fill() {
  fireEvent.change(screen.getByLabelText("Hospital name"), { target: { value: "Gachon Hospital" } });
  fireEvent.change(screen.getByLabelText(/R-BAY address of the hospital/), {
    target: { value: " https://www.r-bay.co.kr/agency/main/ABCDEFGH12345 " },
  });
  fireEvent.change(screen.getByLabelText(/Login label/), { target: { value: " owner " } });
}

beforeEach(() => {
  state.calls = [];
  state.fail = null;
});
afterEach(cleanup);

describe("one-step R-BAY hospital registration", () => {
  it("sends the address, name, login and the three boards ticked by default", async () => {
    const onAdded = open();
    fill();
    fireEvent.click(screen.getByText("Add source"));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('Hospital "Gachon Hospital" added with 3 boards.'));
    expect(state.calls).toEqual([
      {
        address: "https://www.r-bay.co.kr/agency/main/ABCDEFGH12345",
        hospital_name: "Gachon Hospital",
        login_user: "owner",
        boards: ["NOTI", "FORM_BOX", "REGLA"],
      },
    ]);
  });

  it("sends only the boards that stay ticked", async () => {
    open();
    fill();
    fireEvent.click(screen.getByLabelText("양식함"));
    fireEvent.click(screen.getByText("Add source"));
    await waitFor(() => expect(state.calls.length).toBe(1));
    expect((state.calls[0] as { boards: string[] }).boards).toEqual(["NOTI", "REGLA"]);
  });

  it("refuses to send with no board ticked and says so", async () => {
    open();
    fill();
    for (const label of ["공지", "양식함", "관련규정"]) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByText("Add source"));
    expect(await screen.findByText("Tick at least one board.")).toBeTruthy();
    expect(state.calls).toEqual([]);
  });

  it("keeps the dialog open and shows the server's reason when it refuses", async () => {
    state.fail = new Error("already registered for this login: NOTI (공지); nothing was created");
    const onAdded = open();
    fill();
    fireEvent.click(screen.getByText("Add source"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("the hospital chooser of the other kinds is hidden: the hospital is made from the name", () => {
    open();
    expect(screen.getByText("Hospital", { selector: "label" }).className).toContain("hidden");
  });
});
