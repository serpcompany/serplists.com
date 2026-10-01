import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

import { accessHook as fake } from "../../../support/templateEditorAccessHook";

vi.mock("@/features/template-editor/templateDraftStore", () => ({
  clearTemplateDraft: vi.fn(),
  getTemplateDraftKey: () => "serplists:template-draft:user-1:personal",
  listTemplateDraftContexts: () => [],
  readTemplateDraft: () => null,
  saveTemplateDraft: () => true,
  settleTemplateDraftAfterSave: vi.fn(),
}));
import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { forgetKeptState, renderKeepingState, unmountEffects } from "../../../support/hookStateSlots";
import { navigation } from "../../../support/nextNavigation";
import { BILLING_STATUS_QUERY_PREFIX } from "@/lib/billing";

fake.allTemplates = [{ id: "t1", userId: "user-1", teamId: null }];

const LEAVING_FOR_STRIPE = true;
const CHECKOUT_NOT_STARTED = false;

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const values = { title: "Second template", description: "", sections: [] } as unknown as TemplateEditorFormValues;
const options = {
  isCreate: true,
  getValues: () => values,
  allowLeave: vi.fn(),
  guardLeave: vi.fn(),
};

function Editor() {
  return useTemplateEditorAccess(options);
}

const renderedAccess = () => renderKeepingState(Editor);

beforeEach(() => {
  navigation.reset("/dashboard/templates/new");
  forgetKeptState();
  fake.invalidateQueries = vi.fn(async () => undefined);
  fake.startBillingCheckout = vi.fn(async () => LEAVING_FOR_STRIPE);
  options.allowLeave.mockClear();
  options.guardLeave.mockClear();
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
});

describe("useTemplateEditorAccess after Back from checkout", () => {
  it("keeps Upgrade busy while the browser leaves for Stripe", async () => {
    await renderedAccess().startUpgrade();

    expect(renderedAccess().isStartingCheckout).toBe(true);
    expect(options.allowLeave).toHaveBeenCalledTimes(1);
    expect(options.guardLeave).not.toHaveBeenCalled();
  });

  it("offers Upgrade again and refetches the plan when the page is restored", async () => {
    await renderedAccess().startUpgrade();
    renderedAccess();

    window.dispatchEvent(pageshow(true));

    expect(renderedAccess().isStartingCheckout).toBe(false);
    expect(fake.invalidateQueries).toHaveBeenCalledWith({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  });

  it("ignores an ordinary pageshow while the redirect is under way", async () => {
    await renderedAccess().startUpgrade();
    renderedAccess();

    window.dispatchEvent(pageshow(false));

    expect(renderedAccess().isStartingCheckout).toBe(true);
    expect(fake.invalidateQueries).not.toHaveBeenCalled();
  });

  it("guards the page again when checkout did not start", async () => {
    fake.startBillingCheckout = vi.fn(async () => CHECKOUT_NOT_STARTED);

    await renderedAccess().startUpgrade();

    expect(renderedAccess().isStartingCheckout).toBe(false);
    expect(options.guardLeave).toHaveBeenCalledTimes(1);
  });
});
