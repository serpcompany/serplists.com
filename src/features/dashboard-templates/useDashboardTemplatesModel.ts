import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
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
  templatesLoading?: boolean;
  teamId?: string;
  userId?: string;
};

type DashboardTemplateRunOptions = {
  runName?: string;
  templateId: string;
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

type DashboardTemplateRunResult =
  | { kind: 'ok'; runId: string }
  | { kind: 'error'; message: string };

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

  return {
    templates,
    loading,
    isEmpty,
    canCreateTemplate: true,
    canCreateRun: templates.length > 0,
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
      runName: options.runName,
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
    return {
      kind: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create checklist run.',
    };
  }
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

export const useDashboardTemplatesModel = (
  dependencies?: DashboardTemplatesModelDependencies,
) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeTeamId } = useWorkspace();
  const templateContext = useTemplateLists();
  const model = buildDashboardTemplatesState({
    allTemplates: dependencies?.allTemplates ?? templateContext.allTemplates,
    templatesLoading:
      dependencies?.templatesLoading ?? templateContext.templatesLoading,
    teamId: activeTeamId,
    userId: dependencies?.userId ?? user?.id,
  });
  const createRun = dependencies?.createRun ?? templateContext.createRun;
  const deleteTemplate =
    dependencies?.deleteTemplate ?? templateContext.deleteTemplate;
  const navigateTo = dependencies?.navigate ?? navigate;
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

  const selectRunTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const createRunFromTemplate = async (runName?: string) => {
    if (!selectedTemplateId) {
      return {
        kind: 'error' as const,
        message: 'Select a template before starting a run.',
      };
    }

    setIsCreatingRun(true);
    try {
      const result = await createDashboardTemplateRun(
        {
          templateId: selectedTemplateId,
          runName,
        },
        { createRun },
      );

      if (result.kind === 'ok') {
        setRunLauncherOpen(false);
        navigateTo(buildConsoleRunPath(result.runId));
      }

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
    createRunFromTemplate,
    closeRunLauncher,
    isCreatingRun,
    openCreateTemplate,
    openPublicLibrary,
    openRunLauncher,
    openTemplate,
    removeTemplate,
    runLauncherOpen,
    selectedTemplate,
    selectedTemplateId,
    selectRunTemplate,
    preferenceOwnerId: dependencies?.userId ?? user?.id,
  };
};
