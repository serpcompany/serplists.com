'use client';

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

import { subscribeToNavigations } from "@/lib/navigation/navigationSignal";
import { createPageVisitTracker, type PageVisit } from "@/lib/navigation/pageVisit";

// No layout effects during server rendering: they only warn there, and nothing is shown yet.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type PageVisitOptions = {
  // "location" (the default): any navigation ends the visit, a link to the same page
  // included, and so do Back/Forward. "pathname": only a pathname change or unmount ends
  // it, for a page that stays mounted with its state across a same-path link and must still
  // finish its own action (the template editor's create).
  endOn?: "location" | "pathname";
};

// Returns beginVisit(). Call it when an async action starts; after the await, navigate,
// redirect (sign-in, checkout) or open a dialog only while visit.isCurrent(). It is
// false once the page unmounts or the user navigates (another id on the same page, Back,
// any link), because the router would otherwise still run that navigation from a page the
// user has left.
export const usePageVisit = ({ endOn = "location" }: PageVisitOptions = {}): (() => PageVisit) => {
  const pathname = usePathname();
  const [tracker] = useState(createPageVisitTracker);

  // Entered in the effect, not at creation, so StrictMode's remount works too.
  useIsomorphicLayoutEffect(() => {
    tracker.enter();
    return () => tracker.leave();
  }, [tracker, pathname]);

  // Navigations that keep the pathname: another query, the same page again, Back/Forward.
  useEffect(() => {
    if (endOn !== "location") return undefined;
    return subscribeToNavigations(() => {
      tracker.leave();
      tracker.enter();
    });
  }, [endOn, tracker]);

  return tracker.begin;
};
