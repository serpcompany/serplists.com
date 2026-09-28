import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { onPageRestoredFromCache } from "@/lib/page-restore";

/** Runs `callback` whenever the browser restores this page from its back/forward cache. */
export function usePageRestoredFromCache(callback: () => void): void {
  useEffect(() => onPageRestoredFromCache(window, callback), [callback]);
}

/**
 * A pending flag for a button that sends the browser to another site, such as Stripe
 * Checkout or the Customer Portal. Keep it true after the redirect starts, so a second
 * click cannot open a second session. Pressing Back can restore the page from the
 * back/forward cache with that flag still set, so a restore clears it.
 */
export function useRedirectPending(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [pending, setPending] = useState(false);
  useEffect(() => onPageRestoredFromCache(window, () => setPending(false)), []);
  return [pending, setPending];
}
