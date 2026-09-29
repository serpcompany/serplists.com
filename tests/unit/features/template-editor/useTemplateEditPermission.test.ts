import { beforeEach, describe, expect, it, vi } from "vitest";

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: state lives
// in `cells`, and effects run at once on each render.
const fake = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  workspace: {
    canEditTemplates: true,
    isWorkspaceLoading: false,
    teams: [] as Array<{ id: string; role: string }>,
  },
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = fake.cursor++;
    if (!(index in fake.cells)) fake.cells[index] = initial;
    const setState = (next: unknown) => {
      fake.cells[index] = next;
    };
    return [fake.cells[index], setState];
  },
  useEffect: (effect: () => void) => {
    effect();
  },
}));
vi.mock("@/contexts/CloudflareAuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => fake.workspace }));

import { useTemplateEditPermission } from "@/features/template-editor/useTemplateEditPermission";

const organizationTemplate = { userId: "creator-1", teamId: "team-1", ownerType: "team" as const };
// One render of the hook.
const useRendered = (params: Parameters<typeof useTemplateEditPermission>[0]) => {
  fake.cursor = 0;
  return useTemplateEditPermission(params);
};

beforeEach(() => {
  fake.cells = [];
  fake.workspace = { canEditTemplates: true, isWorkspaceLoading: false, teams: [] };
});

describe("useTemplateEditPermission", () => {
  it("decides nothing while the template loads", () => {
    expect(useRendered({ isCreate: false, loading: true, ownership: undefined })).toBe("checking");
  });

  // Unmounting the form would drop unsaved edits without a prompt.
  it("keeps an open form open when a later teams refetch shows a lower role", () => {
    fake.workspace.teams = [{ id: "team-1", role: "editor" }];
    expect(useRendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");

    fake.workspace.teams = [{ id: "team-1", role: "viewer" }];
    expect(useRendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");
  });

  it("keeps the new-template form open when the user switches to a context that cannot create", () => {
    expect(useRendered({ isCreate: true, loading: false, ownership: undefined })).toBe("editable");

    fake.workspace.canEditTemplates = false;
    expect(useRendered({ isCreate: true, loading: false, ownership: undefined })).toBe("editable");
  });

  it("opens the form once a refused viewer gains the role", () => {
    fake.workspace.teams = [{ id: "team-1", role: "viewer" }];
    expect(useRendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe(
      "organization_role",
    );

    fake.workspace.teams = [{ id: "team-1", role: "editor" }];
    expect(useRendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");
  });
});
