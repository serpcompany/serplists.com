'use client';

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

import { subscribeToNavigations } from "@/lib/navigation/navigationSignal";
import { createPageVisitTracker, type PageVisit } from "@/lib/navigation/pageVisit";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type PageVisitOptions = {
  endOn?: "location" | "pathname";
};

export const usePageVisit = ({ endOn = "location" }: PageVisitOptions = {}): (() => PageVisit) => {
  const pathname = usePathname();
  const [tracker] = useState(createPageVisitTracker);

  useIsomorphicLayoutEffect(() => {
    tracker.enter();
    return () => tracker.leave();
  }, [tracker, pathname]);

  useEffect(() => {
    if (endOn !== "location") return undefined;
    return subscribeToNavigations(() => {
      tracker.leave();
      tracker.enter();
    });
  }, [endOn, tracker]);

  return tracker.begin;
};
