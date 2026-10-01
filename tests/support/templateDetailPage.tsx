import { navigation } from './mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import { navigateToLoginWithReturnPath } from '@/lib/access-flow';
import TemplateDetail from '@/views/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../fixtures/v0DemoFixtures';

export const mockUseTemplateDetailModel = vi.fn();
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
  moreMenuItemProps: [] as Array<Record<string, unknown>>,
  recordListsThePageAsksFor: vi.fn(),
  visibilitySwitchProps: [] as Array<Record<string, unknown>>,
  userStillOnThePage: { current: false },
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    roles: {} as Record<string, 'viewer' | 'runner' | 'editor'>,
    teamsUnavailable: false,
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
    useTemplateDetailModel: function useModelWithTheRealPermissionsDuplicateAndTaskCount(options: {
      canEditTemplates: boolean;
      createTemplate: Parameters<typeof duplicateOwnedTemplate>[0]['createTemplate'];
      teamId?: string;
      userId?: string;
    }) {
      const model = mockUseTemplateDetailModel(options);
      return {
        duplicateTemplate: () =>
          duplicateOwnedTemplate({
            activeTeamId: options.teamId,
            createTemplate: options.createTemplate,
            template: model.template,
          }),
        permissions: getTemplateDetailPermissions({
          activeTeamId: options.teamId,
          canEditTemplates: options.canEditTemplates,
          template: model.template,
          userId: options.userId,
        }),
        totalItems: model.template ? countTemplateItems(model.template) : 0,
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
  const roleSetByATestOrImpliedByTheActiveContext = (id: string) =>
    workspaceState.roles[id] ??
    (id === workspaceState.activeTeamId ? (workspaceState.canEditTemplates ? 'editor' : 'runner') : undefined);
  return {
    useWorkspace: () => ({
      ...workspaceState,
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, roleSetByATestOrImpliedByTheActiveContext),
      isRoleUnavailable: (teamId?: string) =>
        teamId ? workspaceState.teamsUnavailable && !(teamId in workspaceState.roles) : false,
      retryWorkspace: vi.fn(),
    }),
  };
});

vi.mock('@/components/ui/switch', async () => {
  const { createElement } = await import('react');
  return {
    Switch: (props: Record<string, unknown>) => {
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
    DropdownMenuItem: (props: Record<string, unknown>) => {
      moreMenuItemProps.push(props);
      return createElement('div', { role: 'menuitem' }, props.children as React.ReactNode);
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
  navigation.reset('/dashboard/templates/tpl-1/', { routes: ['/dashboard/templates/[id]'] });
  return renderToStaticMarkup(
    <TemplateDetail />,
  );
};

export const baseModel = () => ({
  billingState: { billingEnabled: true, isLoading: false, isPro: true },
  history: { data: null, isError: false, isLoading: false },
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
  workspaceState.teamsUnavailable = false;
  workspaceState.workspaceStatus = 'ready';
}

export const hasShareButton = (html: string) => /Share<\/button>/.test(html);
export const hasEditLink = (html: string) => html.includes('href="/dashboard/templates/tpl-1/edit/"');
export const isVisibilitySwitchDisabled = (html: string) =>
  /<button[^>]*id="template-visibility"[^>]*>/.exec(html)?.[0].includes('disabled=""') ?? false;
