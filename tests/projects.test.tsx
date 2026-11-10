import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { NewProjectForm, ProjectSettings, ProjectSites } from "../src/components/projects";
import { cleanNote, parseView, projectErrorKey, projectProblem } from "../src/lib/projects";

// A tiny stand-in for the Supabase query builder: records each call and answers from `db`.
const db = vi.hoisted(() => ({
  calls: [] as string[],
  result: { data: null as unknown, error: null as unknown },
  pushed: [] as string[],
  refreshed: 0,
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

function show(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
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
    expect(screen.getByText(/The sites and documents stay/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(db.pushed).toEqual(["/projects"]));
    expect(db.calls).toEqual(["projects delete id=3"]);
  });
});

describe("ProjectSites", () => {
  const sites = [
    { id: 1, name: "SNUH board" },
    { id: 9, name: null },
  ];
  const available = [{ id: 2, name: "Other board" }];

  it("lists sites, marks one the user can no longer read, and adds a readable one", async () => {
    show(<ProjectSites projectId={5} sites={sites} available={available} />);
    expect(screen.getByText("SNUH board")).toBeTruthy();
    expect(screen.getByText("Site no longer available to you")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add a site"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Site added.")).toBeTruthy();
    expect(db.calls).toEqual(['project_sources insert {"project_id":5,"source_id":2}']);
    expect(db.refreshed).toBe(1);
  });

  it("removes a site, even one the user can no longer read", async () => {
    show(<ProjectSites projectId={5} sites={sites} available={available} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(await screen.findByText("Site removed.")).toBeTruthy();
    expect(db.calls).toEqual(["project_sources delete project_id=5 source_id=9"]);
  });

  it("shows the reason when the database refuses a site", async () => {
    db.result = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    show(<ProjectSites projectId={5} sites={[]} available={available} />);
    fireEvent.change(screen.getByLabelText("Add a site"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/only add sites you can read/);
  });

  it("stops offering sites at 30", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `Board ${i}` }));
    show(<ProjectSites projectId={5} sites={thirty} available={available} />);
    expect(screen.queryByLabelText("Add a site")).toBeNull();
    expect(screen.getByText("A project can hold at most 30 sites.")).toBeTruthy();
  });
});
