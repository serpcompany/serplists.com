import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  ...(await import("../../../support/hookStateSlots")).hooksKeptBetweenRenders,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { billingEnabled: true, limits: { maxTemplates: 1 } } }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("next/navigation", async () => (await import("../../../support/nextNavigation")).nextNavigationMock);
vi.mock("@/contexts/CloudflareAuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeTeamId: null,
    getPermissions: () => ({ canEditTemplates: true }),
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    selectWorkspace: vi.fn(),
    teams: [],
  }),
}));
vi.mock("@/contexts/TemplatesContext", () => ({
  useTemplateLists: () => ({ allTemplates: [], templatesLoading: false }),
}));
vi.mock("@/lib/api", () => ({ api: { getBillingStatus: vi.fn() } }));
vi.mock("@/lib/access-flow", () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: vi.fn(async () => true),
}));

import {
  readTemplateDraft,
  saveTemplateDraft,
  type TemplateDraftStorage,
} from "@/features/template-editor/templateDraftStore";
import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { forgetKeptState, renderKeepingState, unmountEffects } from "../../../support/hookStateSlots";
import { navigation } from "../../../support/nextNavigation";

const owner = { userId: "user-1", teamId: null };

const createStubSessionStorage = (): TemplateDraftStorage & Pick<Storage, "key" | "length"> => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => Array.from(items.keys())[index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
};

const templateValues = (title: string) =>
  buildTemplateEditorFormValues({
    title,
    sections: [
      { id: "section-1", title: "Prep", items: [{ id: "item-1", title: "First task", description: "" }] },
    ],
  });

const draftA = templateValues("Launch plan");
const formB = templateValues("Short checklist");
let formValues = formB;

const options = {
  isCreate: true,
  getValues: () => formValues,
  allowLeave: vi.fn(),
  guardLeave: vi.fn(),
};

const saved: SaveTemplateResult = { success: true, errors: [] };
const limitReached: SaveTemplateResult = {
  success: false,
  errors: [],
  failure: { kind: "upgrade_required", message: "Template limit reached." },
};

function Editor() {
  return useTemplateEditorAccess(options);
}

const renderedAccess = () => renderKeepingState(Editor);

const editorOnceItReadTheKeptDraft = () => {
  renderedAccess();
  return renderedAccess();
};

let storage: ReturnType<typeof createStubSessionStorage>;

beforeEach(() => {
  navigation.reset("/dashboard/templates/new");
  forgetKeptState();
  formValues = formB;
  options.allowLeave.mockClear();
  options.guardLeave.mockClear();
  storage = createStubSessionStorage();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { sessionStorage: storage }));
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
});

describe("useTemplateEditorAccess with an offered kept draft, which work on a different template neither clears nor replaces until the user restores or discards it", () => {
  it("keeps an unrestored draft when a different template is created", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = editorOnceItReadTheKeptDraft();
    expect(access.draft?.values.title).toBe("Launch plan");

    access.settleDraft(saved, formB);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
  });

  it("clears the draft once the restored draft is created", () => {
    saveTemplateDraft(owner, draftA, storage);
    const restored = editorOnceItReadTheKeptDraft().restoreDraft();
    expect(restored?.values).toEqual(draftA);

    renderedAccess().settleDraft(saved, { ...draftA, title: "Launch plan, edited" });

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("keeps a restored draft stored until it saves, since the plan can still read Free for a moment after checkout and a refused save needs it again", () => {
    saveTemplateDraft(owner, draftA, storage);

    editorOnceItReadTheKeptDraft().restoreDraft();

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
  });

  it("clears the draft when the restored create finishes after the editor closed", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = editorOnceItReadTheKeptDraft();
    access.restoreDraft();
    const settle = renderedAccess().settleDraft;
    unmountEffects();

    settle(saved, draftA);

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("does not replace an unrestored draft when a different template is refused", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = editorOnceItReadTheKeptDraft();

    access.settleDraft(limitReached, formB);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
    expect(renderedAccess().draft?.values.title).toBe("Launch plan");
  });

  it("does not replace an unrestored draft to keep the form for an upgrade, sign-in or ended session, and leaves the leave guard up so leaving still asks", async () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = editorOnceItReadTheKeptDraft();

    expect(access.keepDraft()).toBe(false);
    await access.startUpgrade();
    access.signIn();

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
    expect(options.allowLeave).not.toHaveBeenCalled();
  });

  it("keeps the form's work once the offered draft is discarded", () => {
    saveTemplateDraft(owner, draftA, storage);
    editorOnceItReadTheKeptDraft().discardDraft();
    expect(readTemplateDraft(owner, storage)).toBeNull();

    expect(renderedAccess().keepDraft()).toBe(true);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(formB);
  });

  it("clears a draft this form kept once the template is created", () => {
    const access = editorOnceItReadTheKeptDraft();
    access.settleDraft(limitReached, formB);
    expect(readTemplateDraft(owner, storage)?.values).toEqual(formB);

    renderedAccess().settleDraft(saved, formB);

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });
});
