import { vi } from 'vitest';

export type RouteParams = Record<string, string | string[]>;

type Entry = { href: string; state: unknown };

type Snapshot = { href: string; params: RouteParams };

export type NavigationRecord = {
  kind: 'push' | 'replace' | 'back' | 'forward' | 'refresh';
  href?: string;
  via: 'link' | 'router';
};

export type DocumentLoad = { kind: 'assign' | 'replace' | 'reload'; href: string };

export type ResetOptions = {
  params?: RouteParams;
  routes?: string[];
  before?: string[];
  state?: unknown;
};

const DEFAULT_ORIGIN = 'http://localhost';
const HISTORY_STATE_NEXT_JS_WRITES = { __NA: true };

const splitPath = (pathname: string) => pathname.split('/').filter(Boolean);

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function paramsUnderAppRouterPattern(pattern: string, pathname: string): RouteParams | null {
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

export const findRoute = (patterns: string[], pathname: string) => {
  for (const pattern of patterns) {
    const params = paramsUnderAppRouterPattern(pattern, pathname);
    if (params) return { pattern, params };
  }
  return null;
};

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

export class ReadonlyURLSearchParams extends URLSearchParams {
  override append(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  override delete(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  override set(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
  override sort(): never {
    throw new Error('Method unavailable on `ReadonlyURLSearchParams`.');
  }
}

const copyState = (state: unknown) => (state === undefined ? null : structuredClone(state));

const toAppPath = (href: string) => {
  const url = new URL(href);
  return `${url.pathname}${url.search}${url.hash}`;
};

export function createBrowser() {
  let origin = DEFAULT_ORIGIN;
  let entries: Entry[] = [{ href: `${DEFAULT_ORIGIN}/`, state: null }];
  let index = 0;
  let fixedParams: RouteParams | null = {};
  let routes: string[] = [];
  let snapshotTheHooksRead: Snapshot = { href: entries[0].href, params: {} };
  const subscribers = new Set<() => void>();
  const searchParamsCache = new Map<string, ReadonlyURLSearchParams>();
  const events = new EventTarget();

  const current = () => entries[index];
  const resolve = (url: string | URL | null | undefined) => new URL(url ?? current().href, current().href).href;
  const paramsFor = (href: string): RouteParams =>
    fixedParams ?? findRoute(routes, new URL(href).pathname)?.params ?? {};

  const publishSnapshotWhenUrlOrParamsChange = () => {
    const { href } = current();
    if (snapshotTheHooksRead.href === href && fixedParams !== null) return;
    const params = paramsFor(href);
    if (snapshotTheHooksRead.href === href && JSON.stringify(snapshotTheHooksRead.params) === JSON.stringify(params)) return;
    snapshotTheHooksRead = { href, params };
    subscribers.forEach((listener) => listener());
  };

  const pushEntry = (href: string, state: unknown) => {
    entries = [...entries.slice(0, index + 1), { href, state: copyState(state) }];
    index = entries.length - 1;
    publishSnapshotWhenUrlOrParamsChange();
  };

  const replaceEntry = (href: string, state: unknown) => {
    entries = entries.map((entry, position) => (position === index ? { href, state: copyState(state) } : entry));
    publishSnapshotWhenUrlOrParamsChange();
  };

  const traverseOnALaterTask = (delta: number) => {
    const target = index + delta;
    if (delta === 0 || target < 0 || target >= entries.length) return;
    setTimeout(() => {
      index = target;
      publishSnapshotWhenUrlOrParamsChange();
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
    back: () => traverseOnALaterTask(-1),
    forward: () => traverseOnALaterTask(1),
    go: (delta = 0) => traverseOnALaterTask(delta),
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

  const navigate = (href: string, { replace, via }: { replace: boolean; via: NavigationRecord['via'] }) => {
    const target = resolve(href);
    log.push({ kind: replace ? 'replace' : 'push', href: toAppPath(target), via });
    const replacesTheUrlAlreadyOpen = replace || target === current().href;
    if (replacesTheUrlAlreadyOpen) replaceEntry(target, HISTORY_STATE_NEXT_JS_WRITES);
    else pushEntry(target, HISTORY_STATE_NEXT_JS_WRITES);
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
      snapshotTheHooksRead = { href: current().href, params: paramsFor(current().href) };
      subscribers.forEach((listener) => listener());
    },
    navigate,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    getSnapshot: () => snapshotTheHooksRead,
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
