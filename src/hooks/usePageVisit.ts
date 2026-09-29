import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { createPageVisitTracker, type PageVisit } from "@/lib/navigation/pageVisit";

// No layout effects during server rendering (tests render pages to static markup).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type PageVisitOptions = {
  // "location" (the default): any location change ends the visit, a link to the same
  // path included (it gets a new location key). "pathname": only a pathname change or
  // unmount ends it, for a page that stays mounted with its state across a same-path
  // link, and must still finish its own action (the template editor's create).
  endOn?: "location" | "pathname";
};

// Returns beginVisit(). Call it when an async action starts; after the await, navigate,
// redirect (sign-in, checkout) or open a dialog only while visit.isCurrent(). It is
// false once the page unmounts or its location changes (another id on the same page,
// Back, any link), because React Router would otherwise still run that navigation.
export const usePageVisit = ({ endOn = "location" }: PageVisitOptions = {}): (() => PageVisit) => {
  const { key, pathname } = useLocation();
  const visitKey = endOn === "pathname" ? pathname : key;
  const [tracker] = useState(createPageVisitTracker);

  // Entered in the effect, not at creation, so StrictMode's remount works too.
  useIsomorphicLayoutEffect(() => {
    tracker.enter();
    return () => tracker.leave();
  }, [tracker, visitKey]);

  return tracker.begin;
};
