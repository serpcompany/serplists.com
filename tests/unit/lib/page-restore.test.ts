import { describe, expect, it, vi } from "vitest";

import { onPageRestoredFromCache } from "@/lib/page-restore";

const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });

describe("onPageRestoredFromCache", () => {
  it("calls back when the browser restores the page from its back/forward cache", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    onPageRestoredFromCache(target, callback);

    target.dispatchEvent(pageshow(true));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores an ordinary page load", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    onPageRestoredFromCache(target, callback);

    target.dispatchEvent(pageshow(false));
    target.dispatchEvent(new Event("pageshow"));

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops after unsubscribing", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const unsubscribe = onPageRestoredFromCache(target, callback);

    unsubscribe();
    target.dispatchEvent(pageshow(true));

    expect(callback).not.toHaveBeenCalled();
  });
});
