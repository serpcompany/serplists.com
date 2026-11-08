import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readTemplateDraft, saveTemplateDraft } from "@/features/template-editor/templateDraftStore";
import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

import { memoryStorage } from "../../../fixtures/memoryStorage";

vi.mock("next/navigation", async () => (await import("../../../support/nextNavigation")).nextNavigationMock);
vi.mock("@/contexts/CloudflareAuthContext", () => ({ useAuth: () => ({ user: { id: "user-7" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeTeamId: null, isTeamWorkspace: false }) }));
vi.mock("@/contexts/TemplatesContext", () => ({ useTemplateLists: () => ({ allTemplates: [], templatesLoading: true }) }));
vi.mock("@/lib/api", () => ({ api: { getBillingStatus: () => new Promise(() => {}) } }));

const keptDraft = buildTemplateEditorFormValues({
  title: "Launch plan",
  sections: [{ id: "section-1", title: "Prep", items: [{ id: "item-1", title: "Book the venue", description: "" }] }],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the new-template editor rendered on the server", () => {
  it("offers no kept draft, which only the browser can read, so the server's page matches the first browser render", () => {
    vi.stubGlobal("window", Object.assign(new EventTarget(), { sessionStorage: memoryStorage() }));
    saveTemplateDraft({ userId: "user-7", teamId: null }, keptDraft);
    expect(readTemplateDraft({ userId: "user-7", teamId: null })?.values.title).toBe("Launch plan");
    const offered: unknown[] = [];

    function Editor() {
      const access = useTemplateEditorAccess({
        isCreate: true,
        getValues: () => keptDraft,
        getVersion: () => undefined,
        allowLeave: () => {},
        guardLeave: () => {},
      });
      offered.push(access.draft);
      return <p>{access.draft ? "Restore draft" : "New template"}</p>;
    }

    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <Editor />
      </QueryClientProvider>,
    );

    expect(html).toBe("<p>New template</p>");
    expect(offered).toEqual([null]);
  });
});
