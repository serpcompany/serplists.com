import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: refs, state and
// callbacks are plain values, and effects run at once with their cleanups kept.
const fake = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [initial, () => undefined],
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) fake.cleanups.push(cleanup);
  },
}));

vi.mock("next/navigation", async () => (await import("../../../support/nextNavigation")).nextNavigationMock);

import { useTemplateEditorLeaveGuard } from "@/features/template-editor/useTemplateEditorLeaveGuard";
import { confirmLeave, leavePage } from "@/lib/navigation/leaveGuard";
import { navigation } from "../../../support/nextNavigation";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const beforeUnloadPrevented = (): boolean => {
  const event = new Event("beforeunload", { cancelable: true });
  // Node's Event has a read-only returnValue; a browser's BeforeUnloadEvent does not.
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
// True when a sidebar link to another page would be held for the page to decide (the app's
// Link hands it to leavePage) instead of opening at once.
const blocksSidebarClick = (): boolean => {
  const open = vi.fn();
  leavePage("push", open);
  return open.mock.calls.length === 0;
};
// True when signing out would ask first (the leave-guard registry).
const signOutAsks = (): boolean => {
  const dialog = vi.fn(() => false);
  confirmLeave(dialog);
  return dialog.mock.calls.length > 0;
};

beforeEach(() => {
  fake.cleanups = [];
  navigation.reset("/dashboard/templates/new");
  vi.stubGlobal("window", navigation.window);
});

afterEach(() => {
  for (const cleanup of fake.cleanups) cleanup();
  vi.unstubAllGlobals();
});

describe("useTemplateEditorLeaveGuard after Back from checkout", () => {
  it("guards unsaved edits again when the page is restored from the back/forward cache", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(true);
    // The checkout redirect kept the draft and let the page go.
    allowLeave();
    expect(blocksSidebarClick()).toBe(false);
    expect(signOutAsks()).toBe(false);
    expect(beforeUnloadPrevented()).toBe(false);

    window.dispatchEvent(pageshow(true));

    expect(blocksSidebarClick()).toBe(true);
    expect(signOutAsks()).toBe(true);
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it("keeps the exit allowed through an ordinary pageshow", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(true);
    allowLeave();

    window.dispatchEvent(pageshow(false));

    expect(blocksSidebarClick()).toBe(false);
  });

  it("still lets a clean form go after a restore", () => {
    const { allowLeave } = useTemplateEditorLeaveGuard(false);
    allowLeave();

    window.dispatchEvent(pageshow(true));

    expect(blocksSidebarClick()).toBe(false);
    expect(signOutAsks()).toBe(false);
  });
});
