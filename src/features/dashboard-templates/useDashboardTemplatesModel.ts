import { useState } from 'react';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePageVisit } from '@/hooks/usePageVisit';
import type { PageVisit } from '@/lib/navigation/pageVisit';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { getAccessFailure } from '@/lib/api-errors';
import { resolveRunName } from '@/lib/runs/runName';
import {
  getOrganizationPermissions,
  PERSONAL_PERMISSIONS,
  type OrganizationRole,
} from '@/lib/organizationPermissions';
import {
  buildConsoleRunPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateEditPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { isPersonalTemplateOf } from '@/lib/templates/templateOwnership';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

type CreateRun = (params: {
  templateId: string;
  runName?: string;
}) => Promise<ChecklistRun | null>;

type DeleteTemplate = (id: string) => void | Promise<void>;
type Navigate = (path: string) => void;

type DashboardTemplatesStateOptions = {
  allTemplates: ChecklistTemplate[];
  role?: OrganizationRole;
  templatesLoading?: boolean;
  teamId?: string;
  userId?: string;
};

type DashboardTemplateRunOptions = {
  now?: Date;
  runName?: string;
  templateId: string;
  templateTitle: string;
};

type DashboardTemplateRunDependencies = {
  createRun: CreateRun;
};

type DashboardTemplatesModelDependencies = {
  allTemplates?: ChecklistTemplate[];
  createRun?: CreateRun;
  deleteTemplate?: DeleteTemplate;
  navigate?: (path: string) => void;
  templatesLoading?: boolean;
  userId?: string;
};

export type DashboardTemplateRunResult =
  | { kind: 'ok'; runId: string }
  | { kind: 'login_required' }
  | { kind: 'upgrade_required'; message: string }
  | { kind: 'error'; message: string };

type DashboardTemplateRunFailure = Exclude<
  DashboardTemplateRunResult,
  { kind: 'ok' }
>;

type CheckoutRedirectStarted = boolean;

type DashboardTemplateRunFailureActions = {
  navigateToLogin: () => void;
  showError: (message: string) => void;
  upgrade: () => Promise<CheckoutRedirectStarted>;
};

type DeleteDashboardTemplateOptions = {
  selectedTemplateId: string;
  templateId: string;
  templates: ChecklistTemplate[];
};

type DeleteDashboardTemplateDependencies = {
  deleteTemplate: DeleteTemplate;
};

const countTemplateItems = (template: ChecklistTemplate): number =>
  template.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );

export const getInitialDashboardTemplateId = (
  templates: ChecklistTemplate[],
): string => templates[0]?.id ?? '';

export const getDashboardSelectedTemplate = (
  templates: ChecklistTemplate[],
  selectedTemplateId: string,
): ChecklistTemplate | null =>
  templates.find((template) => template.id === selectedTemplateId) ?? null;

export const openDashboardTemplate = (
  navigate: Navigate,
  templateId: string,
): void => {
  navigate(buildConsoleTemplateEditPath(templateId));
};

export const openDashboardCreateTemplate = (navigate: Navigate): void => {
  navigate(buildConsoleTemplateCreatePath());
};

export const openDashboardPublicLibrary = (navigate: Navigate): void => {
  navigate(buildPublicTemplatesPath());
};

export const buildDashboardTemplatesState = ({
  allTemplates,
  role,
  teamId,
  templatesLoading = false,
  userId,
}: DashboardTemplatesStateOptions) => {
  const templates = teamId
    ? allTemplates.filter((template) => template.teamId === teamId)
    : userId
      ? allTemplates.filter((template) => isPersonalTemplateOf(template, userId))
      : [];
  const totalTemplateItems = templates.reduce(
    (total, template) => total + countTemplateItems(template),
    0,
  );
  const loading = Boolean(templatesLoading);
  const isEmpty = !loading && templates.length === 0;
  const permissions = teamId ? getOrganizationPermissions(role) : PERSONAL_PERMISSIONS;

  return {
    templates,
    loading,
    isEmpty,
    canCreateTemplate: permissions.canEditTemplates,
    canCreateRun: templates.length > 0 && permissions.canRun,
    canEditTemplate: permissions.canEditTemplates,
    canRunTemplate: permissions.canRun,
    totalTemplateItems,
  };
};

export const createDashboardTemplateRun = async (
  options: DashboardTemplateRunOptions,
  dependencies: DashboardTemplateRunDependencies,
): Promise<DashboardTemplateRunResult> => {
  try {
    const run = await dependencies.createRun({
      templateId: options.templateId,
      runName: resolveRunName(options.runName, options.templateTitle, options.now),
    });

    if (!run?.id) {
      return {
        kind: 'error',
        message: 'Failed to create checklist run.',
      };
    }

    return {
      kind: 'ok',
      runId: run.id,
    };
  } catch (error) {
    const failure = getAccessFailure(error, 'Failed to create checklist run.');

    if (failure.kind === 'auth_required') {
      return { kind: 'login_required' };
    }

    if (failure.kind === 'upgrade_required') {
      return { kind: 'upgrade_required', message: failure.message };
    }

    return { kind: 'error', message: failure.message };
  }
};

export const reportDashboardTemplateRunFailure = async (
  result: DashboardTemplateRunFailure,
  visit: PageVisit,
  actions: DashboardTemplateRunFailureActions,
): Promise<CheckoutRedirectStarted> => {
  if (result.kind === 'error') {
    actions.showError(result.message);
    return false;
  }

  if (!visit.isCurrent()) {
    return false;
  }

  if (result.kind === 'login_required') {
    actions.navigateToLogin();
    return false;
  }

  return actions.upgrade();
};

export const deleteDashboardTemplate = async (
  options: DeleteDashboardTemplateOptions,
  dependencies: DeleteDashboardTemplateDependencies,
): Promise<string> => {
  await Promise.resolve(dependencies.deleteTemplate(options.templateId));

  if (options.selectedTemplateId !== options.templateId) {
    return options.selectedTemplateId;
  }

  return getInitialDashboardTemplateId(
    options.templates.filter((template) => template.id !== options.templateId),
  );
};

export const finishDashboardTemplateRun = (
  result: DashboardTemplateRunResult,
  visit: PageVisit,
  actions: { closeLauncher: () => void; navigate: Navigate },
): void => {
  if (result.kind !== 'ok') {
    return;
  }

  actions.closeLauncher();
  if (visit.isCurrent()) {
    actions.navigate(buildConsoleRunPath(result.runId));
  }
};

export const useDashboardTemplatesModel = (
  dependencies?: DashboardTemplatesModelDependencies,
) => {
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const { user } = useAuth();
  const { activeTeamId, activeWorkspace, isTeamWorkspace } = useWorkspace();
  const templateContext = useTemplateLists();
  const model = buildDashboardTemplatesState({
    allTemplates: dependencies?.allTemplates ?? templateContext.allTemplates,
    templatesLoading:
      dependencies?.templatesLoading ?? templateContext.templatesLoading,
    role: activeWorkspace.type === 'team' ? activeWorkspace.role : undefined,
    teamId: activeTeamId,
    userId: dependencies?.userId ?? user?.id,
  });
  const createRun = dependencies?.createRun ?? templateContext.createRun;
  const deleteTemplate =
    dependencies?.deleteTemplate ?? templateContext.deleteTemplate;
  const navigateTo = dependencies?.navigate ?? router.push;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    getInitialDashboardTemplateId(model.templates),
  );
  const [runLauncherOpen, setRunLauncherOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  const selectedTemplate = getDashboardSelectedTemplate(
    model.templates,
    selectedTemplateId,
  );

  const openTemplate = (templateId: string) => {
    openDashboardTemplate(navigateTo, templateId);
  };

  const openCreateTemplate = () => {
    openDashboardCreateTemplate(navigateTo);
  };

  const openPublicLibrary = () => {
    openDashboardPublicLibrary(navigateTo);
  };

  const openRunLauncher = (templateId?: string) => {
    const nextTemplateId =
      templateId ?? getInitialDashboardTemplateId(model.templates);

    if (!nextTemplateId) {
      return;
    }

    setSelectedTemplateId(nextTemplateId);
    setRunLauncherOpen(true);
  };

  const closeRunLauncher = () => {
    setRunLauncherOpen(false);
  };

  const createRunFromTemplate = async (
    runName?: string,
  ): Promise<DashboardTemplateRunResult> => {
    if (!selectedTemplate) {
      return {
        kind: 'error',
        message: 'Select a template before starting a run.',
      };
    }

    const visit = beginVisit();
    setIsCreatingRun(true);
    try {
      const result = await createDashboardTemplateRun(
        {
          templateId: selectedTemplate.id,
          templateTitle: selectedTemplate.title,
          runName,
        },
        { createRun },
      );

      finishDashboardTemplateRun(result, visit, {
        closeLauncher: () => setRunLauncherOpen(false),
        navigate: navigateTo,
      });

      return result;
    } finally {
      setIsCreatingRun(false);
    }
  };

  const removeTemplate = async (templateId: string) => {
    const nextSelectedTemplateId = await deleteDashboardTemplate(
      {
        selectedTemplateId,
        templateId,
        templates: model.templates,
      },
      { deleteTemplate },
    );
    setSelectedTemplateId(nextSelectedTemplateId);
  };

  return {
    ...model,
    loadError: templateContext.templatesError,
    retryLoad: () => void templateContext.refetchTemplates(),
    createRunFromTemplate,
    closeRunLauncher,
    isCreatingRun,
    isTeamWorkspace,
    openCreateTemplate,
    openPublicLibrary,
    openRunLauncher,
    openTemplate,
    removeTemplate,
    runLauncherOpen,
    selectedTemplate,
    selectedTemplateId,
    preferenceOwnerId: dependencies?.userId ?? user?.id,
  };
};
