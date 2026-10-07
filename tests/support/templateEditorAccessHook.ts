import './reactHooksKeptBetweenRenders';
import { vi, type Mock } from 'vitest';

type AccessHook = {
  allTemplates: Array<{ id: string; userId: string; teamId: string | null }>;
  maxTemplates: number | null;
  listRequests: unknown[];
  invalidateQueries: Mock<(filters: unknown) => Promise<undefined>>;
  startBillingCheckout: Mock<(billingEnabled: boolean) => Promise<boolean>>;
};

export const accessHook: AccessHook = {
  allTemplates: [],
  maxTemplates: 1,
  listRequests: [],
  invalidateQueries: vi.fn<(filters: unknown) => Promise<undefined>>(async () => undefined),
  startBillingCheckout: vi.fn<(billingEnabled: boolean) => Promise<boolean>>(async () => true),
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { billingEnabled: true, limits: { maxTemplates: accessHook.maxTemplates } } }),
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
  useTemplateLists: (request: unknown) => {
    accessHook.listRequests.push(request);
    return { allTemplates: accessHook.allTemplates, templatesLoading: false };
  },
}));
vi.mock('@/lib/api', () => ({ api: { getBillingStatus: vi.fn() } }));
vi.mock('@/lib/access-flow', () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: (billingEnabled: boolean) => accessHook.startBillingCheckout(billingEnabled),
}));
