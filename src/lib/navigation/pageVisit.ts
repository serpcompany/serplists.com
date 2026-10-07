export type PageVisit = {
  isCurrent: () => boolean;
};

export type PageVisitTracker = {
  enter: () => void;
  leave: () => void;
  begin: () => PageVisit;
};

export const createPageVisitTracker = (): PageVisitTracker => {
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
