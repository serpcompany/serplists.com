import React, {
  forwardRef,
  useMemo,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  createBrowser,
  findRoute,
  objectInheriting,
  ReadonlyURLSearchParams,
  type DocumentLoad,
  type NavigationRecord,
  type ResetOptions,
  type RouteParams,
} from './inMemoryBrowser';

const browser = createBrowser();

export const navigation = {
  reset: (to = '/', options: ResetOptions = {}) => browser.reset(to, options),
  url: () => browser.url(),
  pathname: () => new URL(browser.window.location.href).pathname,
  search: () => new URL(browser.window.location.href).search,
  entries: () => browser.entries(),
  index: () => browser.index(),
  get router() {
    return browser.router;
  },
  get log(): readonly NavigationRecord[] {
    return browser.log;
  },
  get documentLoads(): readonly DocumentLoad[] {
    return browser.documentLoads;
  },
  window: browser.window,
  installWindow(extraWindowProperties: object = {}): () => void {
    const globals = globalThis as Record<string, unknown>;
    const saved = globals['window'];
    const installed = objectInheriting(browser.window);
    Object.defineProperties(installed, Object.getOwnPropertyDescriptors(extraWindowProperties));
    globals['window'] = installed;
    return () => {
      globals['window'] = saved;
    };
  },
  settle: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
};

const useSnapshot = () => useSyncExternalStore(browser.subscribe, browser.getSnapshot, browser.getSnapshot);

function useRouter() {
  return browser.router;
}

function usePathname(): string {
  return new URL(useSnapshot().href).pathname;
}

function useSearchParams(): ReadonlyURLSearchParams {
  return browser.searchParamsFor(useSnapshot().href);
}

function useParams(): RouteParams {
  return useSnapshot().params;
}

class NextNavigationError extends Error {
  constructor(
    message: string,
    readonly digest: string,
  ) {
    super(message);
  }
}

export const nextNavigationMock = {
  ReadonlyURLSearchParams,
  RedirectType: { push: 'push', replace: 'replace' },
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  redirect: (url: string): never => {
    throw new NextNavigationError(`redirect(${url})`, `NEXT_REDIRECT;replace;${url};307;`);
  },
  permanentRedirect: (url: string): never => {
    throw new NextNavigationError(`permanentRedirect(${url})`, `NEXT_REDIRECT;replace;${url};308;`);
  },
  notFound: (): never => {
    throw new NextNavigationError('notFound()', 'NEXT_HTTP_ERROR_FALLBACK;404');
  },
};

type UrlObject = { pathname?: string | null; query?: Record<string, unknown> | string | null; search?: string | null; hash?: string | null };

const formatHref = (href: string | UrlObject): string => {
  if (typeof href === 'string') return href;
  let search = href.search ?? '';
  if (!search && href.query) {
    const query =
      typeof href.query === 'string'
        ? href.query
        : new URLSearchParams(
            Object.entries(href.query).flatMap(([key, value]) =>
              Array.isArray(value) ? value.map((item) => [key, String(item)]) : [[key, String(value)]],
            ),
          ).toString();
    search = query ? `?${query}` : '';
  }
  const hash = href.hash ? (href.hash.startsWith('#') ? href.hash : `#${href.hash}`) : '';
  return `${href.pathname ?? ''}${search}${hash}`;
};

const isLocalUrl = (href: string) => {
  const locationOrigin = new URL(browser.window.location.href).origin;
  try {
    return new URL(href, locationOrigin).origin === locationOrigin;
  } catch {
    return false;
  }
};

type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | UrlObject;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | 'auto' | null;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  onNavigate?: (event: { preventDefault: () => void }) => void;
  children?: ReactNode;
};

const isLeftToTheBrowser = (event: MouseEvent<HTMLAnchorElement>, isDownload: boolean, href: string) => {
  const target = event.currentTarget?.getAttribute?.('target');
  const opensElsewhere =
    (target && target !== '_self') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
  return Boolean(opensElsewhere) || isDownload || !isLocalUrl(href);
};

const isCancelledByOnNavigate = (onNavigate: MockLinkProps['onNavigate']) => {
  if (!onNavigate) return false;
  let cancelled = false;
  onNavigate({
    preventDefault: () => {
      cancelled = true;
    },
  });
  return cancelled;
};

const Link = forwardRef<HTMLAnchorElement, MockLinkProps>(function Link(props, ref) {
  const {
    href,
    replace,
    scroll,
    prefetch,
    shallow,
    passHref,
    legacyBehavior,
    onNavigate,
    onClick,
    children,
    ...anchorProps
  } = props;
  const formatted = useMemo(() => formatHref(href), [href]);
  const prefetchPropNextJsWouldReceive = prefetch === undefined ? 'unset' : String(prefetch);

  const handleClickAsNextLinkDoes = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (isLeftToTheBrowser(event, anchorProps.download !== undefined, formatted)) return;
    event.preventDefault();
    if (isCancelledByOnNavigate(onNavigate)) return;
    browser.navigate(formatted, { replace: Boolean(replace), via: 'link' });
  };

  return (
    <a
      ref={ref}
      href={formatted}
      data-prefetch={prefetchPropNextJsWouldReceive}
      {...anchorProps}
      onClick={handleClickAsNextLinkDoes}
    >
      {children}
    </a>
  );
});

export const nextLinkMock = {
  __esModule: true,
  default: Link,
  useLinkStatus: () => ({ pending: false }),
};

export function RoutedPages({ pages }: { pages: Record<string, ReactNode> }) {
  const pathname = usePathname();
  const match = findRoute(Object.keys(pages), pathname);
  if (!match) return null;
  const pageInstance = `${match.pattern} ${JSON.stringify(match.params)}`;
  return <React.Fragment key={pageInstance}>{pages[match.pattern]}</React.Fragment>;
}

export function renderPageAt(url: string, pages: Record<string, ReactNode>): string {
  navigation.reset(url, { routes: Object.keys(pages) });
  return renderToStaticMarkup(<RoutedPages pages={pages} />);
}
