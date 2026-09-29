import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: state, refs
// and effects live in `cells`, and an effect runs again only when its dependencies
// change, as in React. The draft store is the real one, over a stub sessionStorage.
type EffectCell = { deps?: readonly unknown[]; cleanup?: () => void };
const fake = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = fake.cursor++;
    if (!(index in fake.cells)) fake.cells[index] = initial;
    const setState = (next: unknown) => {
      fake.cells[index] =
        typeof next === "function" ? (next as (value: unknown) => unknown)(fake.cells[index]) : next;
    };
    return [fake.cells[index], setState];
  },
  useRef: (initial: unknown) => {
    const index = fake.cursor++;
    if (!(index in fake.cells)) fake.cells[index] = { current: initial };
    return fake.cells[index];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
    const index = fake.cursor++;
    const previous = fake.cells[index] as EffectCell | undefined;
    const changed =
      !previous?.deps || !deps || deps.some((dep, at) => !Object.is(dep, previous.deps?.[at]));
    if (!changed) return;
    previous?.cleanup?.();
    fake.cells[index] = { deps, cleanup: effect() ?? undefined } satisfies EffectCell;
  },
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
import { navigation } from "../../../support/nextNavigation";

const owner = { userId: "user-1", teamId: null };

const createStorage = (): TemplateDraftStorage & Pick<Storage, "key" | "length"> => {
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

// The editor, reduced to the hook under test.
function Editor() {
  return useTemplateEditorAccess(options);
}

// One render of it under the fake React.
const renderedAccess = () => {
  fake.cursor = 0;
  return Editor();
};

const unmount = () => {
  for (const cell of fake.cells.splice(0)) {
    (cell as EffectCell | undefined)?.cleanup?.();
  }
};

// The editor as the user first sees it, once it has read the kept draft.
const openedEditor = () => {
  renderedAccess();
  return renderedAccess();
};

let storage: ReturnType<typeof createStorage>;

beforeEach(() => {
  navigation.reset("/dashboard/templates/new");
  fake.cells = [];
  fake.cursor = 0;
  formValues = formB;
  options.allowLeave.mockClear();
  options.guardLeave.mockClear();
  storage = createStorage();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { sessionStorage: storage }));
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

// A new template's draft A was kept (a plan limit or an ended session) and the editor
// offers it with Restore draft and Discard. Until the user takes one of those, the
// stored slot is A's: work on a different template must not clear or replace it.
describe("useTemplateEditorAccess with a kept draft that was offered", () => {
  it("keeps an unrestored draft when a different template is created", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = openedEditor();
    expect(access.draft?.values.title).toBe("Launch plan");

    access.settleDraft(saved, formB);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
  });

  it("clears the draft once the restored draft is created", () => {
    saveTemplateDraft(owner, draftA, storage);
    const restored = openedEditor().restoreDraft();
    expect(restored?.values).toEqual(draftA);

    renderedAccess().settleDraft(saved, { ...draftA, title: "Launch plan, edited" });

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("clears the draft when the restored create finishes after the editor closed", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = openedEditor();
    access.restoreDraft();
    const settle = renderedAccess().settleDraft;
    // The editor unmounts while the create saves.
    unmount();

    settle(saved, draftA);

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("does not replace an unrestored draft when a different template is refused", () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = openedEditor();

    access.settleDraft(limitReached, formB);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
    expect(renderedAccess().draft?.values.title).toBe("Launch plan");
  });

  it("does not replace an unrestored draft to keep the form for an upgrade, sign-in or ended session", async () => {
    saveTemplateDraft(owner, draftA, storage);
    const access = openedEditor();

    // The leave guard stays up, so leaving with the form's work still asks.
    expect(access.keepDraft()).toBe(false);
    await access.startUpgrade();
    access.signIn();

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftA);
    expect(options.allowLeave).not.toHaveBeenCalled();
  });

  it("keeps the form's work once the offered draft is discarded", () => {
    saveTemplateDraft(owner, draftA, storage);
    openedEditor().discardDraft();
    expect(readTemplateDraft(owner, storage)).toBeNull();

    expect(renderedAccess().keepDraft()).toBe(true);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(formB);
  });

  it("clears a draft this form kept once the template is created", () => {
    const access = openedEditor();
    access.settleDraft(limitReached, formB);
    expect(readTemplateDraft(owner, storage)?.values).toEqual(formB);

    renderedAccess().settleDraft(saved, formB);

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });
});
