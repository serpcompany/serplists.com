import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  ...(await import("../../../support/hookStateSlots")).hooksKeptBetweenRenders,
}));

vi.mock("next/navigation", async () => (await import("../../../support/nextNavigation")).nextNavigationMock);

import { useTemplateEditorLeaveGuard } from "@/features/template-editor/useTemplateEditorLeaveGuard";
import { confirmLeave, leavePage } from "@/lib/navigation/leaveGuard";
import { forgetKeptState, unmountEffects } from "../../../support/hookStateSlots";
import { navigation } from "../../../support/nextNavigation";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const withTheWritableReturnValueOfABrowserBeforeUnloadEvent = (event: Event) =>
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
const beforeUnloadPrevented = (): boolean => {
  const event = withTheWritableReturnValueOfABrowserBeforeUnloadEvent(new Event("beforeunload", { cancelable: true }));
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const sidebarLinkWaitsForThePage = (): boolean => {
  const open = vi.fn();
  leavePage("push", open);
  return open.mock.calls.length === 0;
};
const signOutAsks = (): boolean => {
  const dialog = vi.fn(() => false);
  confirmLeave(dialog);
  return dialog.mock.calls.length > 0;
};

beforeEach(() => {
  forgetKeptState();
  navigation.reset("/dashboard/templates/new");
  vi.stubGlobal("window", navigation.window);
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
});

describe("useTemplateEditorLeaveGuard after Back from checkout", () => {
  it("guards unsaved edits again when the page is restored from the back/forward cache after the checkout redirect let it go", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(true);
    allowLeave();
    expect(sidebarLinkWaitsForThePage()).toBe(false);
    expect(signOutAsks()).toBe(false);
    expect(beforeUnloadPrevented()).toBe(false);

    window.dispatchEvent(pageshow(true));

    expect(sidebarLinkWaitsForThePage()).toBe(true);
    expect(signOutAsks()).toBe(true);
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it("keeps the exit allowed through an ordinary pageshow", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(true);
    allowLeave();

    window.dispatchEvent(pageshow(false));

    expect(sidebarLinkWaitsForThePage()).toBe(false);
  });

  it("still lets a clean form go after a restore", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(false);
    allowLeave();

    window.dispatchEvent(pageshow(true));

    expect(sidebarLinkWaitsForThePage()).toBe(false);
    expect(signOutAsks()).toBe(false);
  });
});
