import { toast } from "sonner";

import { WORKSPACE_NOT_READY_MESSAGE, type WorkspaceStatus } from "@/contexts/workspaceSelection";
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

type TemplateActionApiClient = Pick<typeof api, "clonePublicTemplate">;

export type CreateTemplate = (
  templateData: Omit<
    ChecklistTemplate,
    "id" | "userId" | "createdAt" | "updatedAt" | "slug"
  >,
) => Promise<ChecklistTemplate>;

export type CreateRun = (params: {
  runName?: string | undefined;
  template?: ChecklistTemplate;
  templateId: string;
}) => Promise<ChecklistRun | null>;

export type TemplateDetailBillingState = {
  billingEnabled: boolean;
  isError: boolean;
  isLoading: boolean;
  isPro: boolean;
};

export const startTemplateRun = async (params: {
  createRun: CreateRun;
  isAuthenticated: boolean;
  runName?: string | undefined;
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
  teamId?: string | undefined;
  template: ChecklistTemplate | null;
  userId?: string | undefined;
  workspaceStatus?: WorkspaceStatus;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: "error", message: "Template not found." };
  }

  if (!canCopyTemplate(params.template)) {
    return { kind: "error", message: "Only public templates can be copied." };
  }

  if (!params.isAuthenticated || !params.userId) {
    return { kind: "login_required" };
  }

  if (params.workspaceStatus === "loading" || params.workspaceStatus === "error") {
    return { kind: "error", message: WORKSPACE_NOT_READY_MESSAGE };
  }

  if (!params.teamId && params.billingState.isLoading) {
    return { kind: "error", message: "Checking your plan. Try again in a moment." };
  }

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

export const duplicateOwnedTemplate = async (params: {
  activeTeamId?: string | undefined;
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
  upgradeRequired: () => void | Promise<unknown>;
  succeeded: (result: Extract<TemplateDetailActionResult, { kind: "ok" }>) => void;
};

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
