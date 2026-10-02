type PageShowTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function onPageRestoredFromCache(target: PageShowTarget, callback: () => void): () => void {
  const listener = (event: Event) => {
    if ('persisted' in event && event.persisted) callback();
  };
  target.addEventListener("pageshow", listener);
  return () => target.removeEventListener("pageshow", listener);
}
