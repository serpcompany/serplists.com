type PageShowTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function onPageRestoredFromCache(target: PageShowTarget, callback: () => void): () => void {
  const listener = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) callback();
  };
  target.addEventListener("pageshow", listener);
  return () => target.removeEventListener("pageshow", listener);
}
