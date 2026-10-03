import { vi } from 'vitest';

import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';

export const PERSONAL_WORKSPACE = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' } as const;

export const inThePersonalWorkspace = (extra: object = {}) => ({
  activeWorkspace: PERSONAL_WORKSPACE,
  consoleContext: PERSONAL_CONSOLE,
  isWorkspaceLoading: false,
  selectWorkspace: vi.fn(),
  workspaces: [PERSONAL_WORKSPACE],
  ...extra,
});
