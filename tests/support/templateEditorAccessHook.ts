import { vi } from 'vitest';

export const accessHook = {
  allTemplates: [] as Array<{ id: string; userId: string; teamId: string | null }>,
  invalidateQueries: vi.fn<(filters: unknown) => Promise<undefined>>(async () => undefined),
  startBillingCheckout: vi.fn<(billingEnabled: boolean) => Promise<boolean>>(async () => true),
};

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...(await import('./hookStateSlots')).hooksKeptBetweenRenders,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { billingEnabled: true, limits: { maxTemplates: 1 } } }),
  useQueryClient: () => ({ invalidateQueries: accessHook.invalidateQueries }),
}));
vi.mock('next/navigation', async () => (await import('./nextNavigation')).nextNavigationMock);
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: null,
    getPermissions: () => ({ canEditTemplates: true }),
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    selectWorkspace: vi.fn(),
    teams: [],
  }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({ allTemplates: accessHook.allTemplates, templatesLoading: false }),
}));
vi.mock('@/lib/api', () => ({ api: { getBillingStatus: vi.fn() } }));
vi.mock('@/lib/access-flow', () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: (billingEnabled: boolean) => accessHook.startBillingCheckout(billingEnabled),
}));
