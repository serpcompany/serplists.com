import '../../support/mockedNextNavigation';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

import TemplateDetail from '@/views/TemplateDetail';

import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  type FakeNode,
} from '../../fixtures/fakeDom';
import { navigation, RoutedPages } from '../../support/nextNavigation';

const { createTemplate, template } = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  template: { current: null as unknown },
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', async () => {
  const { getTemplateDetailPermissions } = await import('@/features/template-detail/templatePermissions');
  const { duplicateOwnedTemplate } = await import('@/features/template-detail/templateActionOutcome');
  return {
    useTemplateDetailModel: (options: { canEditTemplates: boolean; teamId?: string; userId?: string }) => {
      const current = template.current as ReturnType<typeof buildV0DemoPrivateTemplate>;
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
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Pass,
    DropdownMenuItem: ({
      children,
      disabled,
      onClick,
    }: {
      children?: ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" role="menuitem" aria-disabled={disabled ? 'true' : undefined} onClick={onClick}>
        {children}
      </button>
    ),
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

const fakeDom = aFakeDomForEachTest(navigation.window);

let root: Root | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  template.current = buildV0DemoPrivateTemplate();
});

async function renderTemplateDetail() {
  const container = createFakeContainer();
  root = fakeDom.track(createRoot(container as unknown as Element));
  navigation.reset('/dashboard/templates/tpl-1', { routes: ['/dashboard/templates/[id]'] });
  await act(async () => {
    root?.render(<RoutedPages pages={{ '/dashboard/templates/[id]': <TemplateDetail /> }} />);
  });
  return container;
}

const duplicateOrDuplicatingItem = (container: FakeNode) => {
  const [item] = findAll(
    container,
    (node) =>
      node instanceof FakeElement &&
      node.getAttribute('role') === 'menuitem' &&
      node.textContent.startsWith('Duplicat'),
  );
  if (!item) throw new Error('No Duplicate menu item');
  return item as FakeElement;
};

describe('TemplateDetail Duplicate while a copy is being made, which a repeated POST /api/templates would make twice', () => {
  it('creates one copy however often Duplicate is chosen meanwhile, even twice before the page re-renders, and shows the copy is running', async () => {
    let finish: (value: { id: string }) => void = () => {};
    createTemplate.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const container = await renderTemplateDetail();

    await act(async () => {
      click(container, duplicateOrDuplicatingItem(container));
      click(container, duplicateOrDuplicatingItem(container));
    });

    expect(createTemplate).toHaveBeenCalledTimes(1);
    expect(duplicateOrDuplicatingItem(container).textContent).toBe('Duplicating...');
    expect(duplicateOrDuplicatingItem(container).getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      click(container, duplicateOrDuplicatingItem(container));
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
    const container = await renderTemplateDetail();

    await act(async () => {
      click(container, duplicateOrDuplicatingItem(container));
    });
    expect(duplicateOrDuplicatingItem(container).textContent).toBe('Duplicate');
    expect(duplicateOrDuplicatingItem(container).getAttribute('aria-disabled')).toBeNull();

    await act(async () => {
      click(container, duplicateOrDuplicatingItem(container));
    });
    expect(createTemplate).toHaveBeenCalledTimes(2);
  });
});
