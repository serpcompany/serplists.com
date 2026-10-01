'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { forwardRef, useState, type ComponentProps } from 'react';

import { hrefToString, leavesPage } from '@/lib/navigation/leavesPage';
import { hasLeaveGuards, leavePage } from '@/lib/navigation/leaveGuard';
import { reportNavigation } from '@/lib/navigation/navigationSignal';

type LinkProps = ComponentProps<typeof NextLink>;

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onNavigate, prefetch, onMouseEnter, onFocus, onTouchStart, ...props },
  ref,
) {
  const { replace, scroll } = props;
  const pathname = usePathname();
  const router = useRouter();
  const [intent, setIntent] = useState(false);

  return (
    <NextLink
      ref={ref}
      href={href}
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
