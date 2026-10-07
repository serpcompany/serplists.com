import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { onPageRestoredFromCache } from "@/lib/page-restore";

export function usePageRestoredFromCache(callback: () => void): void {
  useEffect(() => onPageRestoredFromCache(window, callback), [callback]);
}

export function useRedirectPending(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [pending, setPending] = useState(false);
  useEffect(() => onPageRestoredFromCache(window, () => setPending(false)), []);
  return [pending, setPending];
}
