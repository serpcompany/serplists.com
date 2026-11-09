import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessHook } from "../../../support/templateEditorAccessHook";

import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import { forgetKeptState, renderKeepingState, unmountEffects } from "../../../support/hookStateSlots";
import { navigation } from "../../../support/nextNavigation";

const values = buildTemplateEditorFormValues({ title: "Launch plan" });

const listRequestOfAnEditor = (isCreate: boolean, maxTemplates: number | null) => {
  forgetKeptState();
  navigation.reset(isCreate ? "/dashboard/templates/new" : "/dashboard/templates/template-1/edit");
  accessHook.maxTemplates = maxTemplates;
  accessHook.listRequests = [];
  renderKeepingState(() =>
    useTemplateEditorAccess({ isCreate, getValues: () => values, allowLeave: vi.fn(), guardLeave: vi.fn() }),
  );
  return accessHook.listRequests;
};

beforeEach(() => {
  vi.stubGlobal("window", navigation.window);
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
  accessHook.maxTemplates = 1;
});

describe("the template editor's access checks", () => {
  it("reads the workspace list only for the new-template limit check", () => {
    expect(listRequestOfAnEditor(true, 1)).toEqual([{ workspace: true }]);
    expect(listRequestOfAnEditor(true, null)).toEqual([{ workspace: false }]);
    expect(listRequestOfAnEditor(false, 1)).toEqual([{ workspace: false }]);
  });
});
