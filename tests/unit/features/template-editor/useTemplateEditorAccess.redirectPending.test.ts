import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: state lives
// in `cells`, and effects run on each render with the previous render's cleanups run.
const fake = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  cleanups: [] as Array<() => void>,
  invalidateQueries: null as null | ((filters: unknown) => Promise<void>),
  startBillingCheckout: null as null | ((billingEnabled: boolean) => Promise<boolean>),
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
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) fake.cleanups.push(cleanup);
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { billingEnabled: true, limits: { maxTemplates: 1 } } }),
  useQueryClient: () => ({ invalidateQueries: fake.invalidateQueries }),
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/dashboard/templates/new", search: "", hash: "" }),
  useNavigate: () => vi.fn(),
}));
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
  useTemplateLists: () => ({ allTemplates: [{ id: "t1", userId: "user-1", teamId: null }], templatesLoading: false }),
}));
vi.mock("@/lib/api", () => ({ api: { getBillingStatus: vi.fn() } }));
vi.mock("@/features/template-editor/templateDraftStore", () => ({
  clearTemplateDraft: vi.fn(),
  // No draft kept in another context (useOtherContextTemplateDraft).
  listTemplateDraftContexts: () => [],
  readTemplateDraft: () => null,
  saveTemplateDraft: () => true,
  settleTemplateDraftAfterSave: vi.fn(),
}));
// The checkout request itself: resolving true means the browser is leaving for Stripe.
vi.mock("@/lib/access-flow", () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: (billingEnabled: boolean) => fake.startBillingCheckout!(billingEnabled),
}));

import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { BILLING_STATUS_QUERY_PREFIX } from "@/lib/billing";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const values = { title: "Second template", description: "", sections: [] } as unknown as TemplateEditorFormValues;
const options = {
  isCreate: true,
  getValues: () => values,
  allowLeave: vi.fn(),
  guardLeave: vi.fn(),
};

// One render of the hook, after the previous render's effects are cleaned up.
const useRenderedAccess = () => {
  for (const cleanup of fake.cleanups.splice(0)) cleanup();
  fake.cursor = 0;
  return useTemplateEditorAccess(options);
};

beforeEach(() => {
  fake.cells = [];
  fake.cursor = 0;
  fake.cleanups = [];
  fake.invalidateQueries = vi.fn(async () => undefined);
  fake.startBillingCheckout = vi.fn(async () => true);
  options.allowLeave.mockClear();
  options.guardLeave.mockClear();
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  for (const cleanup of fake.cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

describe("useTemplateEditorAccess after Back from checkout", () => {
  it("keeps Upgrade busy while the browser leaves for Stripe", async () => {
    await useRenderedAccess().startUpgrade();

    expect(useRenderedAccess().isStartingCheckout).toBe(true);
    expect(options.allowLeave).toHaveBeenCalledTimes(1);
    expect(options.guardLeave).not.toHaveBeenCalled();
  });

  it("offers Upgrade again and refetches the plan when the page is restored", async () => {
    await useRenderedAccess().startUpgrade();
    useRenderedAccess();

    window.dispatchEvent(pageshow(true));

    expect(useRenderedAccess().isStartingCheckout).toBe(false);
    expect(fake.invalidateQueries).toHaveBeenCalledWith({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  });

  it("ignores an ordinary pageshow while the redirect is under way", async () => {
    await useRenderedAccess().startUpgrade();
    useRenderedAccess();

    window.dispatchEvent(pageshow(false));

    expect(useRenderedAccess().isStartingCheckout).toBe(true);
    expect(fake.invalidateQueries).not.toHaveBeenCalled();
  });

  it("guards the page again when checkout did not start", async () => {
    fake.startBillingCheckout = vi.fn(async () => false);

    await useRenderedAccess().startUpgrade();

    expect(useRenderedAccess().isStartingCheckout).toBe(false);
    expect(options.guardLeave).toHaveBeenCalledTimes(1);
  });
});
