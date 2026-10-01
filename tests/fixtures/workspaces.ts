import { vi } from 'vitest';

export const PERSONAL_WORKSPACE = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' } as const;

export const inThePersonalWorkspace = (extra: object = {}) => ({
  activeWorkspace: PERSONAL_WORKSPACE,
  isWorkspaceLoading: false,
  selectWorkspace: vi.fn(),
  workspaces: [PERSONAL_WORKSPACE],
  ...extra,
});
