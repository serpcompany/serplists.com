import type { PageVisit } from "@/lib/navigation/pageVisit";

// A save's bookkeeping (the kept new-template draft) follows what the API did even when
// the user left the editor while it ran; what the page shows or where it navigates
// does not. Runs `settle` with the result either way, and returns the result only
// while the visit is current (null once the user has left).
export const saveTemplateForVisit = async <Result>(params: {
  visit: PageVisit;
  save: () => Promise<Result>;
  settle: (result: Result) => void;
}): Promise<Result | null> => {
  const result = await params.save();
  params.settle(result);
  return params.visit.isCurrent() ? result : null;
};
