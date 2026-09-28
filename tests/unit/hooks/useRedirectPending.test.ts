import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vitest runs without a DOM, so a minimal stand-in for React's state and effects runs
// the hook: state lives in `cells`, and effects run at once with their cleanups kept.
const fakeReact = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = fakeReact.cursor++;
    if (!(index in fakeReact.cells)) fakeReact.cells[index] = initial;
    const setState = (next: unknown) => {
      fakeReact.cells[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(fakeReact.cells[index]) : next;
    };
    return [fakeReact.cells[index], setState];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) fakeReact.cleanups.push(cleanup);
  },
}));

import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });

beforeEach(() => {
  fakeReact.cells = [];
  fakeReact.cursor = 0;
  fakeReact.cleanups = [];
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRedirectPending", () => {
  it("clears the pending flag when Back restores the page from the back/forward cache", () => {
    const [, setPending] = useRedirectPending();
    setPending(true);

    window.dispatchEvent(pageshow(true));

    expect(fakeReact.cells[0]).toBe(false);
  });

  it("keeps the flag through an ordinary pageshow, so a redirect in progress stays guarded", () => {
    const [, setPending] = useRedirectPending();
    setPending(true);

    window.dispatchEvent(pageshow(false));

    expect(fakeReact.cells[0]).toBe(true);
  });

  it("stops listening on unmount", () => {
    const [, setPending] = useRedirectPending();
    setPending(true);

    for (const cleanup of fakeReact.cleanups) cleanup();
    window.dispatchEvent(pageshow(true));

    expect(fakeReact.cells[0]).toBe(true);
  });
});

describe("usePageRestoredFromCache", () => {
  it("runs the callback only for a restore from the back/forward cache", () => {
    const callback = vi.fn();
    usePageRestoredFromCache(callback);

    window.dispatchEvent(pageshow(false));
    window.dispatchEvent(pageshow(true));

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
