import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { applyRouteScroll, decideRouteScroll } from './routeScroll';

// Layout effects run before paint in the browser; on the server (tests render App to a string)
// they only warn, and there is nothing to scroll.
const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Resets the window scroll when a navigation changes the page (see routeScroll.ts for
 * the rule). Render it once inside the Router, before the Routes.
 */
export const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPathnameRef = useRef<string | null>(null);

  // Runs before paint, so the old offset never flashes. decideRouteScroll compares the
  // pathname with the last one seen, so search-only or hash-only changes do nothing.
  useBeforePaintEffect(() => {
    const action = decideRouteScroll({
      previousPathname: previousPathnameRef.current,
      pathname,
      hash,
      navigationType,
    });
    previousPathnameRef.current = pathname;
    applyRouteScroll(action, {
      scrollTo: (options) => window.scrollTo(options),
      getElementById: (id) => document.getElementById(id),
    });
  }, [pathname, hash, navigationType]);

  return null;
};
