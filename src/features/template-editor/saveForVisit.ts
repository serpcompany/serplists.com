import type { PageVisit } from "@/lib/navigation/pageVisit";

export const saveTemplateForVisit = async <Result>(params: {
  visit: PageVisit;
  save: () => Promise<Result>;
  settle: (result: Result) => void;
}): Promise<Result | null> => {
  const result = await params.save();
  params.settle(result);
  return params.visit.isCurrent() ? result : null;
};
