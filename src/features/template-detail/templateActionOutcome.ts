import { toast } from "sonner";

import type { TemplateDetailActionResult } from "@/features/template-detail/useTemplateDetailModel";
import type { PageVisit } from "@/lib/navigation/pageVisit";

type TemplateActionOutcomeHandlers = {
  loginRequired: () => void;
  upgradeRequired: () => void | Promise<void>;
  succeeded: (result: Extract<TemplateDetailActionResult, { kind: "ok" }>) => void;
};

// Acts on a template page action's result (Start Run, Copy/Save, Share). Every outcome
// but a failure moves the user (to the new run or template, sign-in or checkout) or
// opens a dialog on the page, so none of it happens once they have left the page that
// started the action. A failure is still reported; what succeeded stays done.
export const followTemplateActionResult = async (
  result: TemplateDetailActionResult,
  visit: PageVisit,
  handlers: TemplateActionOutcomeHandlers,
): Promise<void> => {
  if (result.kind === "error") {
    toast.error(result.message);
    return;
  }

  if (!visit.isCurrent()) {
    return;
  }

  if (result.kind === "login_required") {
    handlers.loginRequired();
    return;
  }

  if (result.kind === "upgrade_required") {
    await handlers.upgradeRequired();
    return;
  }

  handlers.succeeded(result);
};
