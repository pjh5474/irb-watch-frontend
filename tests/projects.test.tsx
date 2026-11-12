import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { NewProjectForm, ProjectHospitals, ProjectSettings } from "../src/components/projects";
import { cleanNote, parseView, projectErrorKey, projectProblem } from "../src/lib/projects";

// A tiny stand-in for the Supabase query builder: records each call and answers from `db`.
const db = vi.hoisted(() => ({
  calls: [] as string[],
  result: { data: null as unknown, error: null as unknown },
  pushed: [] as string[],
  refreshed: 0,
  pipelines: [] as { hospital_id: number }[],
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => db.pushed.push(href),
    refresh: () => {
      db.refreshed += 1;
    },
  }),
}));

vi.mock("@/lib/supabase/client", () => {
  function chain(table: string, op: string, values?: unknown) {
    const parts: string[] = [`${table} ${op}${values === undefined ? "" : ` ${JSON.stringify(values)}`}`];
    const done = () => {
      db.calls.push(parts.join(" "));
      return Promise.resolve(db.result);
    };
    const builder = {
      eq: (column: string, value: unknown) => {
        parts.push(`${column}=${value}`);
        return builder;
      },
      select: () => builder,
      single: () => done(),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => done().then(ok, bad),
    };
    return builder;
  }
  return {
    createClient: () => ({
      from: (table: string) => ({
        insert: (values: unknown) => chain(table, "insert", values),
        update: (values: unknown) => chain(table, "update", values),
        delete: () => chain(table, "delete"),
      }),
    }),
  };
});

// The sites list asks which hospitals have an IRB pipeline (removing one asks first).
vi.mock("@/lib/api/pipelines", () => ({
  pipelineApi: { list: async () => db.pipelines },
}));

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.calls.length = 0;
  db.pushed.length = 0;
  db.refreshed = 0;
  db.result = { data: null, error: null };
});
afterEach(cleanup);

describe("project helpers", () => {
  it("checks the name and note like the database does", () => {
    expect(projectProblem("  ", "")).toBe("nameEmpty");
    expect(projectProblem("x".repeat(101), "")).toBe("nameLong");
    expect(projectProblem(`  ${"x".repeat(100)}  `, "")).toBeNull();
    expect(projectProblem("ok", "n".repeat(1001))).toBe("noteLong");
    expect(projectProblem("ok", "n".repeat(1000))).toBeNull();
  });

  it("turns database errors into a reason", () => {
    expect(projectErrorKey({ code: "23505" })).toBe("nameTaken");
    expect(projectErrorKey({ code: "P0001", message: "at most 50 projects per user" })).toBe("tooManyProjects");
    expect(projectErrorKey({ code: "P0001", message: "at most 30 sites per project" })).toBe("tooManySites");
    expect(projectErrorKey({ code: "42501" })).toBe("notAllowed");
    expect(projectErrorKey({ code: "23514" })).toBe("invalid");
    expect(projectErrorKey(new Error("network"))).toBe("saveError");
    expect(projectErrorKey(null)).toBe("saveError");
  });

  it("stores a blank note as null and reads the view parameter", () => {
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(" PI: Kim ")).toBe(" PI: Kim ");
    expect(parseView("timeline")).toBe("timeline");
    expect(parseView(undefined)).toBe("documents");
    expect(parseView("anything")).toBe("documents");
  });

  it("has every projects message in Korean too", () => {
    const keys = (o: object, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(ko.projects).sort()).toEqual(keys(en.projects).sort());
    expect(ko.nav.projects).toBeTruthy();
  });
});

describe("NewProjectForm", () => {
  it("creates the project with a trimmed name and opens it", async () => {
    db.result = { data: { id: 7 }, error: null };
    show(<NewProjectForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Study A  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(db.pushed).toEqual(["/projects/7"]));
    expect(db.calls).toEqual(['projects insert {"name":"Study A","note":null}']);
  });

  it("refuses an empty name without a request", async () => {
    show(<NewProjectForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give the project a name.");
    expect(db.calls).toEqual([]);
  });

  it("shows why the database refused (duplicate name)", async () => {
    db.result = { data: null, error: { code: "23505", message: "duplicate key" } };
    show(<NewProjectForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Study A" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You already have a project with this name.");
    expect(db.pushed).toEqual([]);
  });
});

describe("ProjectSettings", () => {
  it("saves a new name and note, then refreshes", async () => {
    db.result = { data: [{ id: 3 }], error: null };
    show(<ProjectSettings id={3} name="Old" note={null} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "PI: Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(db.calls).toEqual(['projects update {"name":"New","note":"PI: Kim"} id=3']);
    expect(db.refreshed).toBe(1);
  });

  it("says the project is gone when no row was changed", async () => {
    db.result = { data: [], error: null };
    show(<ProjectSettings id={3} name="Old" note={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer exists/);
  });

  it("deletes only after a confirm, then goes back to the list", async () => {
    show(<ProjectSettings id={3} name="Old" note={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(db.calls).toEqual([]);
    expect(screen.getByText(/The hospitals and documents stay/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(db.pushed).toEqual(["/projects"]));
    expect(db.calls).toEqual(["projects delete id=3"]);
  });
});

describe("ProjectHospitals", () => {
  const hospitals = [
    { id: 1, name: "SNUH", boards: [{ id: 4, name: "SNUH notices" }, { id: 5, name: "SNUH rules" }] },
    { id: 9, name: "Kimpo Woori", boards: [] },
  ];
  const available = [{ id: 2, name: "Ewha" }];

  it("lists hospitals with their readable boards, and adds any hospital", async () => {
    show(<ProjectHospitals projectId={5} hospitals={hospitals} available={available} />);
    expect(screen.getByText("SNUH")).toBeTruthy();
    expect(screen.getByText("Boards you can read: SNUH notices, SNUH rules")).toBeTruthy();
    expect(screen.getByText(/No board of this hospital is open to you/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add a hospital"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Hospital added.")).toBeTruthy();
    expect(db.calls).toEqual(['project_hospitals insert {"project_id":5,"hospital_id":2}']);
    expect(db.refreshed).toBe(1);
  });

  it("removes a hospital", async () => {
    show(<ProjectHospitals projectId={5} hospitals={hospitals} available={available} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(await screen.findByText("Hospital removed.")).toBeTruthy();
    expect(db.calls).toEqual(["project_hospitals delete project_id=5 hospital_id=9"]);
  });

  it("asks first before removing a hospital that has an IRB pipeline", async () => {
    db.pipelines = [{ hospital_id: 9 }];
    show(<ProjectHospitals projectId={5} hospitals={hospitals} available={available} />);
    await waitFor(() => expect(db.pipelines.length).toBe(1));
    const button = () => screen.getAllByRole("button", { name: /Remove/ })[1];
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(button());
    expect(await screen.findByText(/has an IRB pipeline/)).toBeTruthy();
    expect(db.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove anyway" }));
    expect(await screen.findByText("Hospital removed.")).toBeTruthy();
    expect(db.calls).toEqual(["project_hospitals delete project_id=5 hospital_id=9"]);
    db.pipelines = [];
  });

  it("explains why a project with pipelines cannot be deleted", () => {
    expect(projectErrorKey({ code: "23503" })).toBe("hasPipelines");
  });

  it("shows the reason when the database refuses a hospital", async () => {
    db.result = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    show(<ProjectHospitals projectId={5} hospitals={[]} available={available} />);
    fireEvent.change(screen.getByLabelText("Add a hospital"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/only change your own projects/);
  });

  it("stops offering hospitals at 30", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `Hospital ${i}`, boards: [] }));
    show(<ProjectHospitals projectId={5} hospitals={thirty} available={available} />);
    expect(screen.queryByLabelText("Add a hospital")).toBeNull();
    expect(screen.getByText("A project can hold at most 30 hospitals.")).toBeTruthy();
  });

  it("maps the database's limit message to the right reason", () => {
    expect(projectErrorKey({ code: "P0001", message: "at most 30 hospitals per project" })).toBe("tooManySites");
    expect(projectErrorKey({ code: "P0001", message: "at most 50 projects per user" })).toBe("tooManyProjects");
  });
});
