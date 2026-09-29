// next/navigation and next/link for unit tests, backed by a small in-memory browser.
//
// Next.js's hooks and Link need the App Router, which only exists in a Next.js app. These
// stand-ins keep the parts the app's own navigation code relies on, so tests still run the
// app's Link (src/components/navigation/Link.tsx), useAppRouter and the leave guard
// (useUnsavedChangesGuard) for real:
// - Link renders an <a> and, on a plain click, calls the app's onClick and onNavigate the way
//   next/link does, then navigates unless one of them prevented it;
// - useRouter's push and replace add or replace a history entry (the same URL replaces, as in
//   Next.js), back/forward move through the entries and fire popstate after a tick, as a
//   browser does;
// - usePathname, useSearchParams and useParams follow the current entry, including entries
//   written with window.history.pushState/replaceState (Next.js integrates the History API);
// - `navigation.window` is a window with that history, location, events and confirm().
//
// In a test file:
//   vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
//   vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);
//   import { navigation } from '../../support/nextNavigation';
//   navigation.reset('/profile/alice', { params: { username: 'alice' } });
//
// Static rendering (renderToStaticMarkup) needs only reset(). A test that mounts with React DOM
// and navigates also installs the window (navigation.installWindow(), or fakeDom's
// installFakeDomGlobals(navigation.window)) and can render <RoutedPages> to switch pages as
// the App Router does. Call reset() after vi.resetAllMocks().
import React, {
  forwardRef,
  useMemo,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

export type RouteParams = Record<string, string | string[]>;

type Entry = { href: string; state: unknown };

type Snapshot = { href: string; params: RouteParams };

type NavigationRecord = {
  kind: 'push' | 'replace' | 'back' | 'forward' | 'refresh';
  href?: string;
  via: 'link' | 'router';
};

type DocumentLoad = { kind: 'assign' | 'replace' | 'reload'; href: string };

type ResetOptions = {
  /** The route's params, for every URL (static rendering). */
  params?: RouteParams;
  /** App Router patterns ('/categories/[categorySlug]'); params then follow each URL. */
  routes?: string[];
  /** Earlier history entries, oldest first; the URL given to reset() is the current one. */
  before?: string[];
  /** The current entry's history state. */
  state?: unknown;
};

const DEFAULT_ORIGIN = 'http://localhost';
// The history state Next.js keeps in the entries it writes.
const NEXT_HISTORY_STATE = { __NA: true };

// ---------------------------------------------------------------- routes

const splitPath = (pathname: string) => pathname.split('/').filter(Boolean);

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** The params of `pathname` under an App Router pattern, or null when it does not match. */
export function matchRoute(pattern: string, pathname: string): RouteParams | null {
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(pathname);
  const params: RouteParams = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const segment = patternSegments[index];
    const catchAll = /^\[(\[)?\.\.\.([^\]]+)\]\]?$/.exec(segment);
    if (catchAll) {
      const rest = pathSegments.slice(index).map(safeDecode);
      const optional = Boolean(catchAll[1]);
      if (rest.length === 0 && !optional) return null;
      if (rest.length > 0) params[catchAll[2]] = rest;
      return params;
    }
    const value = pathSegments[index];
    if (value === undefined) return null;
    const dynamic = /^\[([^\]]+)\]$/.exec(segment);
    if (dynamic) {
      params[dynamic[1]] = safeDecode(value);
    } else if (segment !== value) {
      return null;
    }
  }
  return pathSegments.length === patternSegments.length ? params : null;
}

const findRoute = (patterns: string[], pathname: string) => {
  for (const pattern of patterns) {
    const params = matchRoute(pattern, pathname);
    if (params) return { pattern, params };
  }
  return null;
};

// ---------------------------------------------------------------- storage

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
};

// ---------------------------------------------------------------- browser

class ReadonlyURLSearchParams extends URLSearchParams {
  append(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  delete(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  set(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  sort(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
}

const copyState = (state: unknown) => (state === undefined ? null : structuredClone(state));

const toAppPath = (href: string) => {
  const url = new URL(href);
  return `${url.pathname}${url.search}${url.hash}`;
};

function createBrowser() {
  let origin = DEFAULT_ORIGIN;
  let entries: Entry[] = [{ href: `${DEFAULT_ORIGIN}/`, state: null }];
  let index = 0;
  let fixedParams: RouteParams | null = {};
  let routes: string[] = [];
  let snapshot: Snapshot = { href: entries[0].href, params: {} };
  const subscribers = new Set<() => void>();
  const searchParamsCache = new Map<string, ReadonlyURLSearchParams>();
  const events = new EventTarget();

  const current = () => entries[index];
  const resolve = (url: string | URL | null | undefined) => new URL(url ?? current().href, current().href).href;
  const paramsFor = (href: string): RouteParams =>
    fixedParams ?? findRoute(routes, new URL(href).pathname)?.params ?? {};

  // What the hooks read: a new object only when the URL or the params change.
  const publish = () => {
    const { href } = current();
    if (snapshot.href === href && fixedParams !== null) return;
    const params = paramsFor(href);
    if (snapshot.href === href && JSON.stringify(snapshot.params) === JSON.stringify(params)) return;
    snapshot = { href, params };
    subscribers.forEach((listener) => listener());
  };

  const pushEntry = (href: string, state: unknown) => {
    entries = [...entries.slice(0, index + 1), { href, state: copyState(state) }];
    index = entries.length - 1;
    publish();
  };

  const replaceEntry = (href: string, state: unknown) => {
    entries = entries.map((entry, position) => (position === index ? { href, state: copyState(state) } : entry));
    publish();
  };

  // Traversal is asynchronous in a browser: popstate fires on a later task.
  const traverse = (delta: number) => {
    const target = index + delta;
    if (delta === 0 || target < 0 || target >= entries.length) return;
    setTimeout(() => {
      index = target;
      publish();
      events.dispatchEvent(Object.assign(new Event('popstate'), { state: current().state }));
    }, 0);
  };

  const documentLoads: DocumentLoad[] = [];
  const loadDocument = (kind: DocumentLoad['kind'], url: string) => {
    const href = resolve(url);
    documentLoads.push({ kind, href });
    if (kind === 'assign') {
      entries = [...entries.slice(0, index + 1), { href, state: null }];
      index = entries.length - 1;
    } else {
      entries = entries.map((entry, position) => (position === index ? { href, state: null } : entry));
    }
  };

  const url = () => new URL(current().href);

  const location = {
    get href() {
      return current().href;
    },
    set href(value: string) {
      loadDocument('assign', value);
    },
    get origin() {
      return url().origin;
    },
    get protocol() {
      return url().protocol;
    },
    get host() {
      return url().host;
    },
    get hostname() {
      return url().hostname;
    },
    get port() {
      return url().port;
    },
    get pathname() {
      return url().pathname;
    },
    get search() {
      return url().search;
    },
    get hash() {
      return url().hash;
    },
    assign: (value: string) => loadDocument('assign', value),
    replace: (value: string) => loadDocument('replace', value),
    reload: () => loadDocument('reload', current().href),
    toString: () => current().href,
  };

  const history = {
    scrollRestoration: 'auto' as ScrollRestoration,
    get state() {
      return current().state;
    },
    get length() {
      return entries.length;
    },
    pushState: (state: unknown, _unused: string, value?: string | URL | null) => pushEntry(resolve(value), state),
    replaceState: (state: unknown, _unused: string, value?: string | URL | null) =>
      replaceEntry(resolve(value), state),
    back: () => traverse(-1),
    forward: () => traverse(1),
    go: (delta = 0) => traverse(delta),
  };

  const window = {
    location,
    history,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    confirm: vi.fn((_message?: string) => true),
    scrollTo: vi.fn(),
    innerWidth: 1280,
    innerHeight: 800,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  };

  const log: NavigationRecord[] = [];

  // Where the app's Link and Next.js's router send a navigation.
  const navigate = (href: string, { replace, via }: { replace: boolean; via: NavigationRecord['via'] }) => {
    const target = resolve(href);
    log.push({ kind: replace ? 'replace' : 'push', href: toAppPath(target), via });
    // Next.js replaces the entry instead of pushing a copy of the URL that is already open.
    if (replace || target === current().href) replaceEntry(target, NEXT_HISTORY_STATE);
    else pushEntry(target, NEXT_HISTORY_STATE);
  };

  const createRouter = () => ({
    push: vi.fn((href: string, _options?: { scroll?: boolean }) => navigate(href, { replace: false, via: 'router' })),
    replace: vi.fn((href: string, _options?: { scroll?: boolean }) => navigate(href, { replace: true, via: 'router' })),
    back: vi.fn(() => {
      log.push({ kind: 'back', via: 'router' });
      history.back();
    }),
    forward: vi.fn(() => {
      log.push({ kind: 'forward', via: 'router' });
      history.forward();
    }),
    refresh: vi.fn(() => {
      log.push({ kind: 'refresh', via: 'router' });
    }),
    prefetch: vi.fn(),
  });
  let router = createRouter();

  return {
    get router() {
      return router;
    },
    window,
    log,
    documentLoads,
    reset(to = '/', options: ResetOptions = {}) {
      if (options.params && options.routes) throw new Error('reset(): pass params or routes, not both');
      origin = new URL(to, DEFAULT_ORIGIN).origin;
      const base = `${origin}/`;
      entries = [
        ...(options.before ?? []).map((href) => ({ href: new URL(href, base).href, state: null })),
        { href: new URL(to, base).href, state: copyState(options.state ?? null) },
      ];
      index = entries.length - 1;
      routes = options.routes ?? [];
      fixedParams = options.routes ? null : (options.params ?? {});
      log.length = 0;
      documentLoads.length = 0;
      searchParamsCache.clear();
      router = createRouter();
      window.confirm = vi.fn((_message?: string) => true);
      window.scrollTo = vi.fn();
      window.localStorage = createStorage();
      window.sessionStorage = createStorage();
      snapshot = { href: current().href, params: paramsFor(current().href) };
      subscribers.forEach((listener) => listener());
    },
    navigate,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    searchParamsFor(href: string) {
      const search = new URL(href).search;
      let params = searchParamsCache.get(search);
      if (!params) {
        params = new ReadonlyURLSearchParams(search);
        searchParamsCache.set(search, params);
      }
      return params;
    },
    entries: () => entries.map((entry) => toAppPath(entry.href)),
    index: () => index,
    url: () => toAppPath(current().href),
  };
}

const browser = createBrowser();

// ---------------------------------------------------------------- the test API

export const navigation = {
  /** Starts every test from one entry at `to` (a path, or an absolute URL for another origin). */
  reset: (to = '/', options: ResetOptions = {}) => browser.reset(to, options),
  /** The current entry as an in-app path: pathname, query and hash. */
  url: () => browser.url(),
  pathname: () => new URL(browser.window.location.href).pathname,
  search: () => new URL(browser.window.location.href).search,
  /** Every history entry as an in-app path, oldest first, and the current one's index. */
  entries: () => browser.entries(),
  index: () => browser.index(),
  /** Next.js's router as useRouter() returns it; its methods are vi.fn spies. */
  get router() {
    return browser.router;
  },
  /** Every push, replace, back, forward and refresh, and whether a Link or the router sent it. */
  get log(): readonly NavigationRecord[] {
    return browser.log;
  },
  /** Full page loads the app asked for (location.assign, replace, reload, href =). */
  get documentLoads(): readonly DocumentLoad[] {
    return browser.documentLoads;
  },
  /** A window with this history, location, events, confirm() (a vi.fn answering true) and storage. */
  window: browser.window,
  /** Sets globalThis.window to `navigation.window` (plus `extra`); returns the undo. */
  installWindow(extra: object = {}): () => void {
    const globals = globalThis as Record<string, unknown>;
    const saved = globals.window;
    const installed = Object.create(browser.window);
    Object.defineProperties(installed, Object.getOwnPropertyDescriptors(extra));
    globals.window = installed;
    return () => {
      globals.window = saved;
    };
  },
  /** Lets a traversal's popstate (a later task) and what it started run. */
  settle: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
};

// ---------------------------------------------------------------- next/navigation

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

function useParams<T extends RouteParams = RouteParams>(): T {
  return useSnapshot().params as T;
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

// ---------------------------------------------------------------- next/link

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

// next/link's click handling (next/dist/client/app-dir/link.js): the Link's own onClick
// first; then a modified click, a download link or another origin is left to the browser;
// otherwise the default is prevented, onNavigate may cancel, and the router navigates.
const Link = forwardRef<HTMLAnchorElement, MockLinkProps>(function Link(props, ref) {
  const {
    href,
    replace,
    scroll: _scroll,
    prefetch,
    shallow: _shallow,
    passHref: _passHref,
    legacyBehavior: _legacyBehavior,
    onNavigate,
    onClick,
    children,
    ...anchorProps
  } = props;
  const formatted = useMemo(() => formatHref(href), [href]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const target = event.currentTarget?.getAttribute?.('target');
    const modified =
      (target && target !== '_self') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
    if (modified || anchorProps.download !== undefined || !isLocalUrl(formatted)) return;
    event.preventDefault();
    if (onNavigate) {
      let cancelled = false;
      onNavigate({
        preventDefault: () => {
          cancelled = true;
        },
      });
      if (cancelled) return;
    }
    browser.navigate(formatted, { replace: Boolean(replace), via: 'link' });
  };

  return (
    // data-prefetch records the prefetch prop Next.js would receive (unset: its default).
    <a
      ref={ref}
      href={formatted}
      data-prefetch={prefetch === undefined ? 'unset' : String(prefetch)}
      {...anchorProps}
      onClick={handleClick}
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

// ---------------------------------------------------------------- pages

/**
 * Renders the page whose App Router pattern matches the current pathname, as the App Router
 * does: another pattern, or other param values, is a new page (remounted); the same URL, or
 * another query, keeps the page mounted.
 */
export function RoutedPages({ pages }: { pages: Record<string, ReactNode> }) {
  const pathname = usePathname();
  const match = findRoute(Object.keys(pages), pathname);
  if (!match) return null;
  return <React.Fragment key={`${match.pattern} ${JSON.stringify(match.params)}`}>{pages[match.pattern]}</React.Fragment>;
}

/**
 * The server's HTML for the page `url` opens among `pages` (App Router patterns such as
 * '/dashboard/runs/[id]'), with the route's params. Renders no effects, as the server does.
 */
export function renderPageAt(url: string, pages: Record<string, ReactNode>): string {
  navigation.reset(url, { routes: Object.keys(pages) });
  return renderToStaticMarkup(<RoutedPages pages={pages} />);
}
