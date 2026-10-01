import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  workspace: {
    canEditTemplates: true,
    isWorkspaceLoading: false,
    teams: [] as Array<{ id: string; role: string }>,
  },
}));

vi.mock("react", async (importOriginal) => {
  const { useStateKeptBetweenRenders } = await import("../../../support/hookStateSlots");
  return { ...(await importOriginal<typeof import("react")>()), useState: useStateKeptBetweenRenders };
});
vi.mock("@/contexts/CloudflareAuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => fake.workspace }));

import { useTemplateEditPermission } from "@/features/template-editor/useTemplateEditPermission";
import { forgetKeptState, renderKeepingState } from "../../../support/hookStateSlots";

const organizationTemplate = { userId: "creator-1", teamId: "team-1", ownerType: "team" as const };
function Editor(params: Parameters<typeof useTemplateEditPermission>[0]) {
  return useTemplateEditPermission(params);
}

const rendered = (params: Parameters<typeof useTemplateEditPermission>[0]) => renderKeepingState(() => Editor(params));

beforeEach(() => {
  forgetKeptState();
  fake.workspace = { canEditTemplates: true, isWorkspaceLoading: false, teams: [] };
});

describe("useTemplateEditPermission", () => {
  it("decides nothing while the template loads", () => {
    expect(rendered({ isCreate: false, loading: true, ownership: undefined })).toBe("checking");
  });

  it("leaves a template whose owner is unknown after a failed load to the save, since the page shows the load error instead of the form", () => {
    expect(rendered({ isCreate: false, loading: false, ownership: undefined })).toBe("editable");
  });

  it("keeps an open form open when a later teams refetch shows a lower role, since closing it would drop unsaved edits without a prompt", () => {
    fake.workspace.teams = [{ id: "team-1", role: "editor" }];
    expect(rendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");

    fake.workspace.teams = [{ id: "team-1", role: "viewer" }];
    expect(rendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");
  });

  it("keeps the new-template form open when the user switches to a context that cannot create", () => {
    expect(rendered({ isCreate: true, loading: false, ownership: undefined })).toBe("editable");

    fake.workspace.canEditTemplates = false;
    expect(rendered({ isCreate: true, loading: false, ownership: undefined })).toBe("editable");
  });

  it("opens the form once a refused viewer gains the role", () => {
    fake.workspace.teams = [{ id: "team-1", role: "viewer" }];
    expect(rendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe(
      "organization_role",
    );

    fake.workspace.teams = [{ id: "team-1", role: "editor" }];
    expect(rendered({ isCreate: false, loading: false, ownership: organizationTemplate })).toBe("editable");
  });
});
