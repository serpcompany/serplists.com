import { type AccessFailure, BILLING_UNAVAILABLE_MESSAGE } from "@/lib/api-errors";
import type { ChecklistTemplate } from "@/types/checklist";

// What the template editor shows when the plan or the session stands between the user
// and a saved template, and the way forward it offers.
export type TemplateEditorAccessNotice = {
  title: string;
  message: string;
  // checkout: Personal Pro checkout. sign_in: the login page, returning here.
  action: "checkout" | "sign_in" | null;
};

type AccessContext = {
  isOrganization: boolean;
  billingEnabled: boolean;
};

export const TEMPLATE_LIMIT_MESSAGE =
  "Template limit reached. Upgrade to create more templates.";
export const ORGANIZATION_TEMPLATE_PLAN_MESSAGE =
  "This Organization needs a paid plan to create more templates.";

const upgradeNotice = (
  message: string,
  context: AccessContext,
): TemplateEditorAccessNotice => {
  // A Personal Pro checkout cannot lift an Organization's limits.
  if (context.isOrganization) {
    return {
      title: "Organization plan limit",
      message: ORGANIZATION_TEMPLATE_PLAN_MESSAGE,
      action: null,
    };
  }

  if (!context.billingEnabled) {
    return {
      title: "Upgrade unavailable",
      message: `${message} ${BILLING_UNAVAILABLE_MESSAGE}`,
      action: null,
    };
  }

  return { title: "Upgrade to Pro to save this template", message, action: "checkout" };
};

// Plan gates and an ended session get a notice with an action; other failures stay in
// the editor's error list.
export const resolveTemplateSaveFailureNotice = (
  failure: AccessFailure | undefined,
  context: AccessContext,
): TemplateEditorAccessNotice | null => {
  switch (failure?.kind) {
    case "upgrade_required":
      return upgradeNotice(failure.message, context);
    case "auth_required":
      return {
        title: "Signed out",
        message: "Sign in to save this template.",
        action: "sign_in",
      };
    case "billing_unavailable":
      return { title: "Upgrade unavailable", message: failure.message, action: null };
    default:
      return null;
  }
};

// The templates the API counts against the active context's limit: the Personal list
// holds public catalog templates too, so filter to the user's own.
export const countContextTemplates = (
  templates: ChecklistTemplate[],
  owner: { userId: string; teamId?: string | null },
): number =>
  templates.filter((template) =>
    owner.teamId
      ? template.teamId === owner.teamId
      : template.userId === owner.userId && !template.teamId,
  ).length;

// Unknown (billing or the list still loading, or failed) never counts as reached: the
// API check stays authoritative and the save still handles its 403.
export const isTemplateLimitReached = (params: {
  maxTemplates?: number | null;
  ownedCount?: number;
}): boolean =>
  typeof params.maxTemplates === "number" &&
  typeof params.ownedCount === "number" &&
  params.ownedCount >= params.maxTemplates;

// The limit pre-check needs the context's template count, which only the workspace list
// has. Load that list only on the new-template editor and only when the plan has a template
// limit: an editor of an existing template, or a plan without a limit, never reads a list.
export const shouldLoadTemplateCountForLimit = (params: {
  isCreate: boolean;
  maxTemplates?: number | null;
}): boolean => params.isCreate && typeof params.maxTemplates === "number";

// Shown on the new-template editor before the user writes a template the plan cannot save.
export const resolveTemplateLimitNotice = (
  limitReached: boolean,
  context: AccessContext,
): TemplateEditorAccessNotice | null =>
  limitReached ? upgradeNotice(TEMPLATE_LIMIT_MESSAGE, context) : null;

// A new template's draft kept in another context: a confirmed sign-out returns the tab to
// Personal, so a draft kept in an Organization is not the active context's after sign-in.
// Offered (newest first) only for a context the user can still create templates in, and
// only once the Organization list is known: the tab may still be moving into one.
export const findOtherContextDraft = <T extends { teamId: string | null }>(
  drafts: T[],
  params: {
    activeTeamId?: string;
    workspaceReady: boolean;
    canCreateIn: (teamId: string | null) => boolean;
  },
): T | null => {
  if (!params.workspaceReady) {
    return null;
  }
  const activeTeamId = params.activeTeamId ?? null;
  return (
    drafts.find((draft) => draft.teamId !== activeTeamId && params.canCreateIn(draft.teamId)) ?? null
  );
};
