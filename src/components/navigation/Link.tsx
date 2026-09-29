'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { forwardRef, useState, type ComponentProps } from 'react';

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
 *
 * A link prefetches its page on intent: once the user points at, focuses or touches it
 * (Next.js's hover-triggered prefetch pattern). Next.js would otherwise prefetch every link
 * that scrolls into view, and each prefetch is a request to the Worker. A caller's own
 * `prefetch` wins.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onNavigate, replace, scroll, prefetch, onMouseEnter, onFocus, onTouchStart, ...props },
  ref,
) {
  const pathname = usePathname();
  const router = useRouter();
  const [intent, setIntent] = useState(false);

  return (
    <NextLink
      ref={ref}
      href={href}
      replace={replace}
      scroll={scroll}
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        setIntent(true);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        setIntent(true);
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        setIntent(true);
      }}
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
