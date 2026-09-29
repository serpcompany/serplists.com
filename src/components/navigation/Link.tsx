'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { forwardRef, type ComponentProps } from 'react';

import { hrefToString, leavesPage } from '@/lib/navigation/leavesPage';
import { hasLeaveGuards, leavePage } from '@/lib/navigation/leaveGuard';
import { reportNavigation } from '@/lib/navigation/navigationSignal';

type LinkProps = ComponentProps<typeof NextLink>;

/**
 * Every in-app link. While a page has a leave guard (useUnsavedChangesGuard), a link to
 * another page goes through it (leavePage): the page decides whether the user leaves, and
 * the router then opens the link. A link that only changes the search or hash of the current
 * page never asks. External, modifier-key, and new-tab clicks are left to the browser
 * (Next.js does not call onNavigate for them), and beforeunload covers those.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onNavigate, replace, scroll, ...props },
  ref,
) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <NextLink
      ref={ref}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled) return;
        if (!leavesPage(href, pathname) || !hasLeaveGuards()) {
          reportNavigation();
          return;
        }
        // The page decides first, so the router opens the link instead of Next.js's Link.
        event.preventDefault();
        const target = hrefToString(href);
        leavePage(replace ? 'replace' : 'push', (method) => {
          reportNavigation();
          router[method](target, scroll === undefined ? undefined : { scroll });
        });
      }}
      {...props}
    />
  );
});
