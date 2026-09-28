/**
 * Scroll handling for client-side navigations. BrowserRouter uses history.pushState,
 * which never resets the window's scroll, so without this a link near the bottom of a
 * long page opens the next page at the old offset (or at its footer).
 *
 * The rule: when the pathname changes on anything but a Back/Forward (POP) navigation,
 * scroll to the URL's #anchor if it is on the page, otherwise to the top. Search-only
 * changes (the library rewrites ?search= on every keystroke) and POP navigations keep
 * the current scroll, so the browser's own Back/Forward restoration still works.
 */

export type RouteNavigationType = 'POP' | 'PUSH' | 'REPLACE';

export type RouteScrollAction =
  | { kind: 'none' }
  | { kind: 'top' }
  | { kind: 'anchor'; id: string };

export interface RouteScrollInput {
  previousPathname: string | null;
  pathname: string;
  hash: string;
  navigationType: RouteNavigationType;
}

const decodeAnchorId = (hash: string): string | null => {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const decideRouteScroll = ({
  previousPathname,
  pathname,
  hash,
  navigationType,
}: RouteScrollInput): RouteScrollAction => {
  // First render: the browser owns the initial scroll (and its own #anchor jump).
  if (previousPathname === null || previousPathname === pathname) {
    return { kind: 'none' };
  }
  if (navigationType === 'POP') {
    return { kind: 'none' };
  }
  const anchorId = decodeAnchorId(hash);
  return anchorId ? { kind: 'anchor', id: anchorId } : { kind: 'top' };
};

export interface RouteScrollTarget {
  scrollTo: (options: ScrollToOptions) => void;
  getElementById: (id: string) => { scrollIntoView: () => void } | null;
}

export const applyRouteScroll = (
  action: RouteScrollAction,
  target: RouteScrollTarget,
): void => {
  if (action.kind === 'none') {
    return;
  }
  if (action.kind === 'anchor') {
    const element = target.getElementById(action.id);
    if (element) {
      element.scrollIntoView();
      return;
    }
  }
  // 'instant' so a smooth scroll-behavior in CSS can never animate the reset.
  target.scrollTo({ top: 0, left: 0, behavior: 'instant' });
};
