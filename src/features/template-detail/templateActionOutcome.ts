import { toast } from "sonner";

import { buildTemplateCopyPayload } from "@/features/template-detail/templateDetailMappers";
import { api } from "@/lib/api";
import type { PageVisit } from "@/lib/navigation/pageVisit";
import {
  buildRepoTemplateCreatePayload,
  isRepoTemplate,
} from "@/lib/repoTemplateCatalog";
import type { ChecklistRun, ChecklistTemplate } from "@/types/checklist";

import { mapActionFailure, type TemplateDetailActionResult } from "./templateDetailApi";
import { canCopyTemplate } from "./templatePermissions";

export type { TemplateDetailActionResult } from "./templateDetailApi";

// The template pages' actions (Start Run, Copy/Save, Duplicate, and the model's Share)
// each resolve to an outcome instead of acting on the page; followTemplateActionResult
// then acts on that outcome for the page that started it.

type TemplateActionApiClient = Pick<typeof api, "clonePublicTemplate">;

export type CreateTemplate = (
  templateData: Omit<
    ChecklistTemplate,
    "id" | "userId" | "createdAt" | "updatedAt" | "slug"
  >,
) => Promise<ChecklistTemplate>;

export type CreateRun = (params: {
  runName?: string;
  template?: ChecklistTemplate;
  templateId: string;
}) => Promise<ChecklistRun | null>;

export type TemplateDetailBillingState = {
  billingEnabled: boolean;
  /** The plan check failed and no plan is known; never treat this as Free. */
  isError: boolean;
  isLoading: boolean;
  isPro: boolean;
};

export const startTemplateRun = async (params: {
  createRun: CreateRun;
  isAuthenticated: boolean;
  runName?: string;
  template: ChecklistTemplate | null;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: "error", message: "Template not found." };
  }

  if (!params.isAuthenticated) {
    return { kind: "login_required" };
  }

  try {
    const run = await params.createRun({
      templateId: params.template.id,
      runName: params.runName,
      template: params.template,
    });

    if (!run?.id) {
      return { kind: "error", message: "Failed to start template run" };
    }

    return { kind: "ok", runId: run.id };
  } catch (error) {
    return mapActionFailure(error, "Failed to start template run");
  }
};

export const saveTemplateToAccount = async (params: {
  apiClient?: TemplateActionApiClient;
  billingState: TemplateDetailBillingState;
  createTemplate: CreateTemplate;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  teamId?: string;
  template: ChecklistTemplate | null;
  userId?: string;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: "error", message: "Template not found." };
  }

  // The API clones only public templates. Checked before the plan so a private
  // template never sends anyone to checkout for a copy that cannot succeed.
  if (!canCopyTemplate(params.template)) {
    return { kind: "error", message: "Only public templates can be copied." };
  }

  if (!params.isAuthenticated || !params.userId) {
    return { kind: "login_required" };
  }

  // Only Personal copying is a Pro feature. The API enforces an Organization's Template
  // limit (a Free Organization may copy within it) and reports limit_reached, which
  // maps to upgrade_required.
  if (!params.teamId && params.billingState.isLoading) {
    return { kind: "error", message: "Checking your plan. Try again in a moment." };
  }

  // A failed plan check is not the Free plan: ask for a retry instead of checkout.
  if (!params.teamId && params.billingState.isError) {
    return { kind: "error", message: "Couldn't check your plan. Try again." };
  }

  if (!params.teamId && !params.billingState.isPro) {
    return { kind: "upgrade_required" };
  }

  const apiClient = params.apiClient ?? api;

  try {
    if (isRepoTemplate(params.template)) {
      const createdTemplate = await params.createTemplate(
        buildRepoTemplateCreatePayload(params.template, params.teamId),
      );
      return { kind: "ok", templateId: createdTemplate.id };
    }

    const clonedTemplate = await apiClient.clonePublicTemplate(params.template.id, {
      teamId: params.teamId,
      visibility: "private",
    });

    await params.invalidateTemplates?.();

    return { kind: "ok", templateId: clonedTemplate.id };
  } catch (error) {
    return mapActionFailure(error, "Failed to save template");
  }
};

// Duplicate on a template the user can edit. The copy goes where buildTemplateCopyPayload
// sends it (another Organization's private template stays in that Organization) and counts
// against that context's template limit, so a plan gate comes back as upgrade_required.
export const duplicateOwnedTemplate = async (params: {
  activeTeamId?: string;
  createTemplate: CreateTemplate;
  template: ChecklistTemplate;
}): Promise<TemplateDetailActionResult> => {
  try {
    const duplicatedTemplate = await params.createTemplate(
      buildTemplateCopyPayload(params.template, params.activeTeamId),
    );

    return { kind: "ok", templateId: duplicatedTemplate.id };
  } catch (error) {
    return mapActionFailure(error, "Failed to duplicate template");
  }
};

type TemplateActionOutcomeHandlers = {
  loginRequired: () => void;
  // May resolve with whether a checkout redirect started; the result is not used here.
  upgradeRequired: () => void | Promise<unknown>;
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
