import { vi } from 'vitest';

import type { OrganizationRole } from '@/lib/organizationPermissions';

export const workspaceRoles = {
  roles: {} as Record<string, OrganizationRole>,
  teamsUnavailable: false,
};

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceRoles.roles[id]),
      isRoleUnavailable: (teamId?: string) =>
        teamId ? workspaceRoles.teamsUnavailable && !(teamId in workspaceRoles.roles) : false,
      retryWorkspace: vi.fn(),
    }),
  };
});
