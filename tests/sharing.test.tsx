import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { ProjectAccessProvider } from "../src/components/projects/project-access";
import { ProjectMembers } from "../src/components/projects/project-members";
import { OrganizationProjectsLink, SharedProjects } from "../src/components/projects/shared-projects";
import { ApiError } from "../src/lib/api/client";
import type { Sharing } from "../src/lib/api/projects";

const OWNER_VIEW: Sharing = {
  project_id: 1,
  access: "owner",
  owner: { id: "o", name: "Owner Park" },
  members: [
    { user: { id: "p", name: "PM Choi" }, role: "pm", in_organization: true },
    { user: { id: "m", name: "Moved Kang" }, role: "member", in_organization: false },
  ],
  can_manage_members: true,
  can_manage: true,
  is_member: false,
};

const state = vi.hoisted(() => ({
  sharing: null as unknown,
  calls: [] as unknown[],
  shared: [] as unknown[],
  orgError: null as unknown,
  pushed: [] as string[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: (href: string) => state.pushed.push(href), refresh: () => {} }),
}));

vi.mock("@/lib/api/projects", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/projects")>("../src/lib/api/projects");
  const call = (name: string) => async (...args: unknown[]) => {
    state.calls.push([name, ...args]);
    return state.sharing;
  };
  return {
    ...actual,
    projectApi: {
      sharing: async () => state.sharing,
      candidates: async () => [{ id: "c", name: "Colleague Han" }],
      addMember: call("addMember"),
      removeMember: call("removeMember"),
      setPm: call("setPm"),
      handOver: call("handOver"),
      leave: call("leave"),
      shared: async () => state.shared,
      organization: async () => {
        if (state.orgError) throw state.orgError;
        return [];
      },
    },
  };
});

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.sharing = OWNER_VIEW;
  state.calls = [];
  state.shared = [];
  state.orgError = null;
  state.pushed = [];
});
afterEach(cleanup);

describe("ProjectMembers", () => {
  const members = () =>
    show(
      <ProjectAccessProvider projectId={1}>
        <ProjectMembers projectId={1} />
      </ProjectAccessProvider>,
    );

  it("lets the owner add a colleague, set the PM and see who moved away", async () => {
    members();
    expect(await screen.findByText("Owner Park")).toBeTruthy();
    expect(screen.getByText(/moved to another organization/)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Add a colleague"), { target: { value: "c" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Added to the project.");
    // Only members still in the organization can be the PM.
    const pm = screen.getByLabelText("PM") as HTMLSelectElement;
    expect([...pm.options].map((o) => o.textContent)).toEqual(["No PM", "PM Choi"]);
    fireEvent.change(pm, { target: { value: "" } });
    await vi.waitFor(() => expect(state.calls).toEqual([["addMember", 1, "c"], ["setPm", 1, null]]));
  });

  it("a member sees no management, only Leave", async () => {
    state.sharing = { ...OWNER_VIEW, access: "edit", can_manage_members: false, can_manage: false, is_member: true };
    members();
    expect(await screen.findByText("Owner Park")).toBeTruthy();
    expect(screen.queryByLabelText("Add a colleague")).toBeNull();
    expect(screen.queryByLabelText("PM")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave the project" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave the project" }));
    await vi.waitFor(() => expect(state.pushed).toEqual(["/projects"]));
    expect(state.calls).toEqual([["leave", 1]]);
  });

  it("a PM can remove members but not the PM", async () => {
    state.sharing = {
      ...OWNER_VIEW,
      access: "pm",
      can_manage: false,
      members: [
        { user: { id: "p", name: "PM Choi" }, role: "pm", in_organization: true },
        { user: { id: "x", name: "CRA Yoon" }, role: "member", in_organization: true },
      ],
    };
    members();
    expect(await screen.findByText("CRA Yoon")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1); // the member's, not the PM's
    expect(screen.queryByText("Hand the project over")).toBeNull();
  });
});

describe("SharedProjects and the organization link", () => {
  it("lists projects shared with me with their owner", async () => {
    state.shared = [{ project_id: 7, name: "Study B", owner: { id: "o", name: "Owner Park" }, role: "member" }];
    show(<SharedProjects />);
    expect((await screen.findByRole("link", { name: "Study B" })).getAttribute("href")).toBe("/projects/7");
    expect(screen.getByText("owner: Owner Park")).toBeTruthy();
  });

  it("hides the organization link for users who are not organization admins", async () => {
    state.orgError = new ApiError(403, "only an organization's admins can list its projects");
    show(<OrganizationProjectsLink />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    state.orgError = null;
    show(<OrganizationProjectsLink />);
    expect((await screen.findByRole("link")).getAttribute("href")).toBe("/organization/projects");
  });
});
