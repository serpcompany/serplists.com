import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateDetail from '@/views/TemplateDetail';

import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  installFakeDomGlobals,
  type FakeNode,
} from '../../fixtures/fakeDom';
import { navigation, RoutedPages } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// Duplicate creates a Template (POST /api/templates has no idempotency). The actions menu
// closes on the first click and a slow request shows nothing, so the user can choose
// Duplicate again. Drives the real page; only the page model, the contexts, toasts and the
// Radix menu and switch are faked, so the menu renders in place.

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
vi.mock('@/hooks/usePageVisit', () => ({ usePageVisit: () => () => ({ isCurrent: () => true }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequiredForContext: vi.fn(),
  navigateToLoginWithReturnPath: vi.fn(),
}));

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
beforeEach(() => {
  vi.clearAllMocks();
  template.current = buildV0DemoPrivateTemplate();
});

async function renderTemplateDetail() {
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  navigation.reset('/dashboard/templates/tpl-1', { routes: ['/dashboard/templates/[id]'] });
  await act(async () => {
    root?.render(<RoutedPages pages={{ '/dashboard/templates/[id]': <TemplateDetail /> }} />);
  });
  return container;
}

// The Duplicate item, whatever it reads while a copy is being made.
const duplicateItem = (container: FakeNode) => {
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

describe('TemplateDetail Duplicate while a copy is being made', () => {
  it('creates one copy when Duplicate is chosen again, and shows the copy is running', async () => {
    let finish: (value: { id: string }) => void = () => {};
    createTemplate.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const container = await renderTemplateDetail();

    // Two choices before the page re-renders: only a synchronous guard can stop the second.
    await act(async () => {
      click(container, duplicateItem(container));
      click(container, duplicateItem(container));
    });

    expect(createTemplate).toHaveBeenCalledTimes(1);
    expect(duplicateItem(container).textContent).toBe('Duplicating...');
    expect(duplicateItem(container).getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      click(container, duplicateItem(container));
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
      click(container, duplicateItem(container));
    });
    expect(duplicateItem(container).textContent).toBe('Duplicate');
    expect(duplicateItem(container).getAttribute('aria-disabled')).toBeNull();

    await act(async () => {
      click(container, duplicateItem(container));
    });
    expect(createTemplate).toHaveBeenCalledTimes(2);
  });
});
