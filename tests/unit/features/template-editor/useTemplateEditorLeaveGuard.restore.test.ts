import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: refs and
// callbacks are plain values, and effects run at once with their cleanups kept.
const fake = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  blockerFunction: null as null | ((args: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) => boolean),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) fake.cleanups.push(cleanup);
  },
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/dashboard/templates/new" }),
  useBlocker: (blockerFunction: typeof fake.blockerFunction) => {
    fake.blockerFunction = blockerFunction;
    return { state: "unblocked", proceed: vi.fn(), reset: vi.fn() };
  },
}));

import { useTemplateEditorLeaveGuard } from "@/features/template-editor/useTemplateEditorLeaveGuard";
import { confirmLeave } from "@/lib/navigation/leaveGuard";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const beforeUnloadPrevented = (): boolean => {
  const event = new Event("beforeunload", { cancelable: true });
  // Node's Event has a read-only returnValue; a browser's BeforeUnloadEvent does not.
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const blocksSidebarClick = (): boolean =>
  fake.blockerFunction!({
    currentLocation: { pathname: "/dashboard/templates/new" },
    nextLocation: { pathname: "/dashboard/templates" },
  });
// True when signing out would ask first (the leave-guard registry).
const signOutAsks = (): boolean => {
  const dialog = vi.fn(() => false);
  confirmLeave(dialog);
  return dialog.mock.calls.length > 0;
};

beforeEach(() => {
  fake.cleanups = [];
  fake.blockerFunction = null;
  vi.stubGlobal("window", new EventTarget());
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
