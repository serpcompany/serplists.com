'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { forwardRef, type ComponentProps } from 'react';

import { leavesPage } from '@/lib/navigation/leavesPage';
import { confirmLeave } from '@/lib/navigation/leaveGuard';

type LinkProps = ComponentProps<typeof NextLink>;

/**
 * Every in-app link. A page holding unsaved work (useUnsavedChangesGuard) is asked before a
 * link takes the user to another page; a link that only changes the search or hash of the
 * current page never asks. External, modifier-key, and new-tab clicks are left to the browser
 * (Next.js does not call onNavigate for them), and beforeunload covers those.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onNavigate, ...props },
  ref,
) {
  const pathname = usePathname();

  return (
    <NextLink
      ref={ref}
      href={href}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (leavesPage(href, pathname) && !confirmLeave()) {
          event.preventDefault();
        }
      }}
      {...props}
    />
  );
});
