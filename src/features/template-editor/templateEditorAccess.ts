import { type AccessFailure, BILLING_UNAVAILABLE_MESSAGE } from "@/lib/api-errors";
import type { ChecklistTemplate } from "@/types/checklist";

export type TemplateEditorAccessNotice = {
  title: string;
  message: string;
  action: "checkout" | "sign_in" | null;
};

type AccessContext = {
  isOrganization: boolean;
  billingEnabled: boolean;
};

const TEMPLATE_LIMIT_MESSAGE =
  "Template limit reached. Upgrade to create more templates.";
export const ORGANIZATION_TEMPLATE_PLAN_MESSAGE =
  "This Organization needs a paid plan to create more templates.";

const upgradeNotice = (
  message: string,
  context: AccessContext,
): TemplateEditorAccessNotice => {
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

export const countContextTemplates = (
  templates: ChecklistTemplate[],
  owner: { userId: string; teamId?: string | null | undefined },
): number =>
  templates.filter((template) =>
    owner.teamId
      ? template.teamId === owner.teamId
      : template.userId === owner.userId && !template.teamId,
  ).length;

export const isTemplateLimitReached = (params: {
  maxTemplates?: number | null | undefined;
  ownedCount?: number | undefined;
}): boolean =>
  typeof params.maxTemplates === "number" &&
  typeof params.ownedCount === "number" &&
  params.ownedCount >= params.maxTemplates;

export const shouldLoadTemplateCountForLimit = (params: {
  isCreate: boolean;
  maxTemplates?: number | null | undefined;
}): boolean => params.isCreate && typeof params.maxTemplates === "number";

export const resolveTemplateLimitNotice = (
  limitReached: boolean,
  context: AccessContext,
): TemplateEditorAccessNotice | null =>
  limitReached ? upgradeNotice(TEMPLATE_LIMIT_MESSAGE, context) : null;

export const findOtherContextDraft = <T extends { teamId: string | null }>(
  drafts: T[],
  params: {
    activeTeamId?: string | undefined;
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
