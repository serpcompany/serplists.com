'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
};

const readHash = () => window.location.hash;
// The server never sees the hash, so it renders without one and the browser adds it.
const readServerHash = () => '';

/**
 * The current page as an in-app path (pathname, query and hash), for a link that brings the
 * user back here, such as sign-in's `next`. Reads the query with useSearchParams, so a
 * statically rendered page needs a Suspense boundary around its caller.
 */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash);
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}
