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
const readServerHash = () => '';

export function useCurrentPath(): string {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash);
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}
