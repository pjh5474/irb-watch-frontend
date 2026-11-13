"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { type ProjectAccess, type Sharing, canEdit, projectApi } from "@/lib/api/projects";

export const sharingKey = (projectId: number) => ["projects", "sharing", projectId] as const;

type Value = { access: ProjectAccess | undefined; canEdit: boolean; isOwner: boolean; sharing: Sharing | undefined; loading: boolean };

// Without a provider (older pages, tests) the user is the owner, as before sharing existed.
const ProjectAccessContext = createContext<Value>({
  access: "owner",
  canEdit: true,
  isOwner: true,
  sharing: undefined,
  loading: false,
});

/** The signed-in user's level on one project, for every editing part inside it (phase B1). */
export function ProjectAccessProvider({ projectId, children }: { projectId: number; children: React.ReactNode }) {
  const sharing = useQuery({ queryKey: sharingKey(projectId), queryFn: () => projectApi.sharing(projectId) });
  const access = sharing.data?.access;
  return (
    <ProjectAccessContext.Provider
      value={{
        access,
        // Until it is known (or if it cannot be read), nothing is offered for editing.
        canEdit: canEdit(access),
        isOwner: access === "owner",
        sharing: sharing.data,
        loading: sharing.isLoading,
      }}
    >
      {children}
    </ProjectAccessContext.Provider>
  );
}

export function useProjectAccess(): Value {
  return useContext(ProjectAccessContext);
}
