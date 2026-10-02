import { navigation } from './mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import PublicTemplate from '@/views/PublicTemplate';
import type { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { RunNameDialog } from '@/components/ui/run-name-dialog';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import type { ChecklistTemplate } from '@/types/checklist';
import type { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { lastOf } from './elements';

type TemplateDetailModelArgs = Parameters<typeof useTemplateDetailModel>;
type TemplateDetailModel = Partial<ReturnType<typeof useTemplateDetailModel>>;
type TemplateDetailModelDouble = (...args: TemplateDetailModelArgs) => TemplateDetailModel;
type ViewProps = React.ComponentProps<typeof PublicTemplateView>;
type DialogProps = React.ComponentProps<typeof RunNameDialog>;

const {
  authState,
  mockCreateBillingCheckout,
  mockDialogProps,
  mockToastError,
  mockToastSuccess,
  mockUseTemplateDetailModel,
  mockViewProps,
  staleCatalogCopy,
  workspaceState,
} = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    user: null as { id: string } | null,
  },
  mockCreateBillingCheckout: vi.fn(),
  mockDialogProps: vi.fn<(props: DialogProps) => void>(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockUseTemplateDetailModel: vi.fn<TemplateDetailModelDouble>(),
  mockViewProps: vi.fn<(props: ViewProps) => void>(),
  staleCatalogCopy: {
    id: 'clipy-template-1',
    slug: 'reviewed-clipy-checklist',
    title: 'Stale catalog title',
    isPublic: true,
    sections: [],
    userId: 'user-1',
    ownerProfile: { username: 'alice' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    canRunTemplates: true,
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    retryWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    workspaceStatus: 'ready' as 'ready' | 'loading' | 'error',
  },
}));

vi.mock('@/hooks/usePageVisit', async () => (await import('./pageVisitMock')).pageVisitOfAUserStillOnThePage);

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: TemplateDetailModelArgs) => mockUseTemplateDetailModel(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    createRun: vi.fn(),
    createTemplate: vi.fn(),
    templates: [staleCatalogCopy],
  }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: { trackTemplateView: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  api: { createBillingCheckout: mockCreateBillingCheckout },
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock('@/components/template/PublicTemplateView', async (importOriginal) => {
  const { createElement } = await import('react');
  const actual = await importOriginal<
    typeof import('@/components/template/PublicTemplateView')
  >();
  return {
    PublicTemplateView: (
      props: React.ComponentProps<typeof actual.PublicTemplateView>,
    ) => {
      mockViewProps(props);
      return createElement(actual.PublicTemplateView, props);
    },
  };
});

vi.mock('@/components/ui/run-name-dialog', () => ({
  RunNameDialog: (props: DialogProps) => {
    mockDialogProps(props);
    return null;
  },
}));

export {
  authState,
  mockCreateBillingCheckout,
  mockDialogProps,
  mockToastError,
  mockToastSuccess,
  mockUseTemplateDetailModel,
  mockViewProps,
  workspaceState,
};

export function resetToASignedInUserInPersonal() {
  mockToastError.mockReset();
  mockUseTemplateDetailModel.mockReset();
  mockViewProps.mockReset();
  authState.isAuthenticated = true;
  authState.user = { id: 'user-1' };
  workspaceState.activeTeamId = undefined;
  workspaceState.canEditTemplates = true;
  workspaceState.canRunTemplates = true;
  workspaceState.isTeamWorkspace = false;
  workspaceState.isWorkspaceLoading = false;
}

export const publishedClipyTemplate: ChecklistTemplate = {
  id: 'clipy-template-1',
  slug: 'reviewed-clipy-checklist',
  title: 'Reviewed Clipy Checklist',
  description: 'Persisted Clipy summary.',
  seoTitle: 'Saved Clipy Search Title',
  seoDescription: 'Saved Clipy search description with five actionable steps.',
  isPublic: true,
  sections: [{
    id: 'steps',
    title: 'Steps',
    items: [{
      id: 'source',
      title: 'Watch the source recording',
      description: '',
      contents: [
        {
          type: 'text',
          value: '### Recording summary\nPersisted summary.\n\n### Transcript\nPersisted transcript.',
        },
        {
          type: 'video',
          uploadType: 'url',
          value: 'https://clipy.online/video/8fptqlnappr6',
        },
        {
          type: 'image',
          uploadType: 'url',
          value: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
        },
      ],
    }],
  }],
  userId: 'user-1',
  ownerProfile: { username: 'alice' },
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  categories: ['packing'],
  tags: ['Clipy'],
};

interface RouteVisit {
  path: string;
  origin: string;
  search?: string;
  hash?: string;
}

export const CLEAN_VISIT: RouteVisit = {
  path: '/profile/alice/reviewed-clipy-checklist',
  origin: 'https://serplists.com',
};

let restoreWindow: () => void = () => {};

export function installNavigationWindow(): void {
  restoreWindow = navigation.installWindow();
}

export function restoreNavigationWindow(): void {
  restoreWindow();
}

export const robotsTagThePageAdds = (html: string) => html.match(/<meta name="robots" content="([^"]*)"/)?.[1];

export function renderPublishedRoute(
  template: ChecklistTemplate,
  modelOverrides: TemplateDetailModel = {},
  visit: RouteVisit = CLEAN_VISIT,
) {
  mockUseTemplateDetailModel.mockReturnValue({
    billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
    loading: false,
    notFound: false,
    saveTemplate: vi.fn(),
    startRun: vi.fn(),
    template,
    totalItems: countTemplateItems(template),
    ...modelOverrides,
  });
  navigation.reset(`${visit.origin}${visit.path}${visit.search ?? ''}${visit.hash ?? ''}`, {
    routes: ['/profile/[username]/[templateSlug]'],
  });
  return { html: renderToStaticMarkup(<PublicTemplate />) };
}

export const lastViewProps = (): ViewProps => lastOf(mockViewProps.mock.calls)[0];

export const lastDialogProps = (): DialogProps => lastOf(mockDialogProps.mock.calls)[0];
