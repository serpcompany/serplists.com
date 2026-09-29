import type { LinkProps } from 'next/link';

type Href = LinkProps['href'];

const hrefToString = (href: Href): string => {
  if (typeof href === 'string') return href;
  const pathname = href.pathname ?? '';
  const search = typeof href.search === 'string' ? href.search : '';
  const hash = typeof href.hash === 'string' ? href.hash : '';
  return `${pathname}${search}${hash}`;
};

/**
 * True when following `href` from `currentPathname` opens another page. A change of search or
 * hash keeps the page mounted, so it never counts as leaving (unsaved work is not at risk).
 */
export const leavesPage = (href: Href, currentPathname: string | null): boolean => {
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.href;
  const target = new URL(hrefToString(href) || '.', base);
  return target.pathname !== (currentPathname ?? new URL(base).pathname);
};
