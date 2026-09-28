type PageShowTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Calls `callback` when the browser restores the page from its back/forward cache,
 * for example when the user presses Back on Stripe Checkout. The page's JavaScript
 * state comes back exactly as it was left, so state set just before leaving (such as a
 * disabled "Opening checkout..." button) must be reset here. Returns an unsubscribe.
 */
export function onPageRestoredFromCache(target: PageShowTarget, callback: () => void): () => void {
  const listener = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) callback();
  };
  target.addEventListener("pageshow", listener);
  return () => target.removeEventListener("pageshow", listener);
}
