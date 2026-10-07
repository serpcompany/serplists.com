import { navigation } from './mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import { navigateToLoginWithReturnPath } from '@/lib/access-flow';
import { buildConsoleTemplatePath, ownerConsoleContext } from '@/lib/consoleRoutes';
import TemplateDetail from '@/views/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../fixtures/v0DemoFixtures';
import type { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import type { TeamSummary } from '@/lib/schemas/teamResponses';
import { present } from './elements';
import type { ElementProps } from './elementTree';

type TemplateDetailModelArgs = Parameters<typeof useTemplateDetailModel>;
type TemplateDetailModel = ReturnType<typeof useTemplateDetailModel>;

export const mockUseTemplateDetailModel = vi.fn<(...args: TemplateDetailModelArgs) => Partial<TemplateDetailModel>>();
const {
  contextCreateTemplate,
  contextUpdateTemplate,
  moreMenuItemProps,
  recordListsThePageAsksFor,
  visibilitySwitchProps,
  userStillOnThePage,
  workspaceState,
} = vi.hoisted(() => ({
  contextCreateTemplate: vi.fn(),
  contextUpdateTemplate: vi.fn(),
  moreMenuItemProps: [] as ElementProps[],
  recordListsThePageAsksFor: vi.fn(),
  visibilitySwitchProps: [] as ElementProps[],
  userStillOnThePage: { current: false },
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    roles: {} as Record<string, 'viewer' | 'runner' | 'editor'>,
    teams: [] as TeamSummary[],
    workspaceStatus: 'ready' as 'ready' | 'loading' | 'error',
  },
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', async () => {
  const { getTemplateDetailPermissions } = await import(
    '@/features/template-detail/templatePermissions'
  );
  const { duplicateOwnedTemplate } = await import(
    '@/features/template-detail/templateActionOutcome'
  );
  const { countTemplateItems } = await import('@/lib/templates/templateItemCount');
  return {
    useTemplateDetailModel: function useModelWithTheRealPermissionsDuplicateAndTaskCount(...args: TemplateDetailModelArgs) {
      const [options] = args;
      const model = mockUseTemplateDetailModel(...args);
      const template = model.template ?? null;
      return {
        duplicateTemplate: () =>
          duplicateOwnedTemplate({
            activeTeamId: options.teamId,
            createTemplate: options.createTemplate,
            template: present(template, 'a template to duplicate'),
          }),
        permissions: getTemplateDetailPermissions({
          activeTeamId: options.teamId,
          canEditTemplates: options.mode === 'private' && options.canEditTemplates,
          template,
          userId: options.userId,
        }),
        totalItems: template ? countTemplateItems(template) : 0,
        ...model,
      };
    },
  };
});

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      email: 'john@example.com',
      id: 'user-1',
      username: 'designops',
    },
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => {
  const useTemplates = () => ({
    createRun: vi.fn(),
    createTemplate: contextCreateTemplate,
    deleteTemplate: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: contextUpdateTemplate,
  });
  const useTemplateLists = (options?: Record<string, unknown>) => {
    recordListsThePageAsksFor(options);
    return useTemplates();
  };
  return { useTemplates, useTemplateLists };
});

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  const { ownerConsoleContext } = await import('@/lib/consoleRoutes');
  const roleImpliedByTheActiveContext = (id: string) =>
    id === workspaceState.activeTeamId
      ? workspaceState.canEditTemplates ? 'editor' : 'runner'
      : undefined;
  const roleSetByATestOrImpliedByTheActiveContext = (id: string) =>
    workspaceState.roles[id] ?? roleImpliedByTheActiveContext(id);
  return {
    useWorkspace: () => ({
      ...workspaceState,
      consoleContext: ownerConsoleContext(workspaceState.activeTeamId),
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, roleSetByATestOrImpliedByTheActiveContext),
    }),
  };
});

vi.mock('@/components/ui/switch', async () => {
  const { createElement } = await import('react');
  return {
    Switch: (props: ElementProps) => {
      visibilitySwitchProps.push(props);
      return createElement('button', {
        'aria-checked': String(props.checked),
        disabled: props.disabled,
        id: props.id,
        role: 'switch',
      });
    },
  };
});

vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dropdown-menu')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    DropdownMenuItem: (props: ElementProps & { children?: React.ReactNode }) => {
      moreMenuItemProps.push(props);
      return createElement('div', { role: 'menuitem' }, props.children);
    },
    DropdownMenuSeparator: () => createElement('hr'),
  };
});

vi.mock('@/hooks/usePageVisit', () => ({
  usePageVisit: () => () => ({ isCurrent: () => userStillOnThePage.current }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequiredForContext: vi.fn(),
  navigateToLoginWithReturnPath: vi.fn(),
}));

export {
  contextCreateTemplate,
  contextUpdateTemplate,
  moreMenuItemProps,
  recordListsThePageAsksFor,
  userStillOnThePage,
  visibilitySwitchProps,
  workspaceState,
};

export const renderTemplateDetail = () => {
  navigation.reset(buildConsoleTemplatePath('tpl-1', ownerConsoleContext(workspaceState.activeTeamId)), {
    routes: ['/dashboard/templates/[id]', '/dashboard/organization/[organizationId]/templates/[id]'],
  });
  return renderToStaticMarkup(
    <TemplateDetail />,
  );
};

export const baseModel = (): Partial<TemplateDetailModel> => ({
  billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: true },
  history: { data: null, isError: false, isLoading: false, onViewAll: vi.fn(), showingAll: false },
  loading: false,
  notFound: false,
  saveTemplate: vi.fn(),
  shareTemplate: vi.fn(),
  startRun: vi.fn(),
  template: buildV0DemoPrivateTemplate(),
});

export function resetTemplateDetailPageMocks() {
  contextCreateTemplate.mockReset();
  contextUpdateTemplate.mockReset();
  moreMenuItemProps.length = 0;
  mockUseTemplateDetailModel.mockReset();
  visibilitySwitchProps.length = 0;
  userStillOnThePage.current = false;
  vi.mocked(navigateToLoginWithReturnPath).mockClear();
  workspaceState.activeTeamId = undefined;
  workspaceState.canEditTemplates = true;
  workspaceState.isTeamWorkspace = false;
  workspaceState.isWorkspaceLoading = false;
  workspaceState.roles = {};
  workspaceState.teams = [];
  workspaceState.workspaceStatus = 'ready';
}

export const hasShareButton = (html: string) => /Share<\/button>/.test(html);
export const hasEditLink = (html: string) =>
  /href="\/dashboard\/(?:organization\/[^/"]+\/)?templates\/tpl-1\/edit\/"/.test(html);
export const isVisibilitySwitchDisabled = (html: string) =>
  /<button[^>]*id="template-visibility"[^>]*>/.exec(html)?.[0].includes('disabled=""') ?? false;
