import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const { useEffectKeptBetweenRenders, useStateKeptBetweenRenders } = await import("../../support/hookStateSlots");
  return {
    ...(await importOriginal<typeof import("react")>()),
    useEffect: useEffectKeptBetweenRenders,
    useState: useStateKeptBetweenRenders,
  };
});

import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";
import { forgetKeptState, renderKeepingState, unmountEffects } from "../../support/hookStateSlots";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
const renderedPending = () => renderKeepingState(useRedirectPending);
const isPending = () => renderedPending()[0];

beforeEach(() => {
  forgetKeptState();
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
});

describe("useRedirectPending", () => {
  it("clears the pending flag when Back restores the page from the back/forward cache", () => {
    const [, setPending] = renderedPending();
    setPending(true);

    window.dispatchEvent(pageshow(true));

    expect(isPending()).toBe(false);
  });

  it("keeps the flag through an ordinary pageshow, so a redirect in progress stays guarded", () => {
    const [, setPending] = renderedPending();
    setPending(true);

    window.dispatchEvent(pageshow(false));

    expect(isPending()).toBe(true);
  });

  it("stops listening on unmount", () => {
    const [, setPending] = renderedPending();
    setPending(true);

    unmountEffects();
    window.dispatchEvent(pageshow(true));

    expect(isPending()).toBe(true);
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
