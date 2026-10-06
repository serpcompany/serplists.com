import { vi } from 'vitest';

import type { OrganizationRole } from '@/lib/organizationPermissions';

export const workspaceRoles = {
  roles: {} as Record<string, OrganizationRole>,
};

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  const { PERSONAL_CONSOLE } = await import('@/lib/consoleRoutes');
  return {
    useWorkspace: () => ({
      consoleContext: PERSONAL_CONSOLE,
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceRoles.roles[id]),
    }),
  };
});
