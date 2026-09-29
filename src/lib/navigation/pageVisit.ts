// The router still runs a navigation started by a page the user has already left: a
// request that finishes late would pull them back to that page's destination. A page
// visit lets an async action check, after each await, that the user is still on the
// page that started it, at the same location, before moving them anywhere.
export type PageVisit = {
  isCurrent: () => boolean;
};

export type PageVisitTracker = {
  // The page is shown at a location (mount, or a new location on the same page).
  enter: () => void;
  // The page is gone, or about to show a new location.
  leave: () => void;
  // Called when an action starts.
  begin: () => PageVisit;
};

export const createPageVisitTracker = (): PageVisitTracker => {
  // Bumped on every enter and leave, so a visit ends on any change, even when the user
  // comes back to the same location later.
  let generation = 0;
  let shown = false;

  return {
    enter: () => {
      generation += 1;
      shown = true;
    },
    leave: () => {
      generation += 1;
      shown = false;
    },
    begin: () => {
      const started = shown ? generation : -1;
      return { isCurrent: () => shown && generation === started };
    },
  };
};
