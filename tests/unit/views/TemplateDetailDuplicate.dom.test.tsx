import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

import TemplateDetail from '@/views/TemplateDetail';

import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import { present } from '../../support/elements';
import type { ChecklistTemplate } from '@/types/checklist';

const { createTemplate, template } = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  template: { current: null as ChecklistTemplate | null },
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', async () => {
  const { getTemplateDetailPermissions } = await import('@/features/template-detail/templatePermissions');
  const { duplicateOwnedTemplate } = await import('@/features/template-detail/templateActionOutcome');
  return {
    useTemplateDetailModel: (options: { canEditTemplates: boolean; teamId?: string; userId?: string }) => {
      const current = present(template.current, 'the template the test opened');
      return {
        billingState: { billingEnabled: true, isLoading: false, isPro: true },
        duplicateTemplate: () =>
          duplicateOwnedTemplate({ activeTeamId: options.teamId, createTemplate, template: current }),
        history: { data: null, isError: false, isLoading: false },
        loading: false,
        notFound: false,
        permissions: getTemplateDetailPermissions({
          activeTeamId: options.teamId,
          canEditTemplates: options.canEditTemplates,
          template: current,
          userId: options.userId,
        }),
        refetchBilling: vi.fn(),
        reload: vi.fn(),
        saveTemplate: vi.fn(),
        setVisibility: vi.fn(),
        shareTemplate: vi.fn(),
        startRun: vi.fn(),
        template: current,
      };
    },
  };
});
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'user-1', username: 'designops' } }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({ createRun: vi.fn(), createTemplate, deleteTemplate: vi.fn() }),
}));
vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      activeTeamId: undefined,
      canEditTemplates: true,
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, () => undefined),
      isTeamWorkspace: false,
      teams: [],
      workspaceStatus: 'ready',
    }),
  };
});
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked }: { checked?: boolean }) => <button type="button" role="switch" aria-checked={Boolean(checked)} />,
}));
vi.mock('@/hooks/usePageVisit', async () => (await import('../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequiredForContext: vi.fn(),
  navigateToLoginWithReturnPath: vi.fn(),
}));

theInMemoryBrowserAsTheWindow();

beforeEach(() => {
  vi.clearAllMocks();
  template.current = buildV0DemoPrivateTemplate();
});

async function renderTemplateDetail() {
  navigation.reset('/dashboard/templates/tpl-1', { routes: ['/dashboard/templates/[id]'] });
  await renderSettled(<RoutedPages pages={{ '/dashboard/templates/[id]': <TemplateDetail /> }} />);
}

const duplicateOrDuplicatingItem = () => screen.getByRole('menuitem', { name: /^Duplicat/ });

describe('TemplateDetail Duplicate while a copy is being made, which a repeated POST /api/templates would make twice', () => {
  it('creates one copy however often Duplicate is chosen meanwhile, even twice before the page re-renders, and shows the copy is running', async () => {
    let finish: (value: { id: string }) => void = () => {};
    createTemplate.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await renderTemplateDetail();

    await openTheMenu('Template actions');
    const duplicate = duplicateOrDuplicatingItem();
    await act(async () => {
      fireEvent.click(duplicate);
      fireEvent.click(duplicate);
    });

    expect(createTemplate).toHaveBeenCalledTimes(1);
    await openTheMenu('Template actions');
    expect(duplicateOrDuplicatingItem().textContent).toBe('Duplicating...');
    expect(duplicateOrDuplicatingItem().getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      fireEvent.click(duplicateOrDuplicatingItem());
    });
    expect(createTemplate).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ id: 'tpl-2' });
    });
    expect(createTemplate).toHaveBeenCalledTimes(1);
  });

  it('lets Duplicate run again once a copy failed', async () => {
    createTemplate.mockRejectedValueOnce(new Error('Network down'));
    createTemplate.mockReturnValueOnce(new Promise(() => {}));
    await renderTemplateDetail();

    await openTheMenu('Template actions');
    await act(async () => {
      fireEvent.click(duplicateOrDuplicatingItem());
    });
    await openTheMenu('Template actions');
    expect(duplicateOrDuplicatingItem().textContent).toBe('Duplicate');
    expect(duplicateOrDuplicatingItem().getAttribute('aria-disabled')).toBeNull();

    await act(async () => {
      fireEvent.click(duplicateOrDuplicatingItem());
    });
    expect(createTemplate).toHaveBeenCalledTimes(2);
  });
});
