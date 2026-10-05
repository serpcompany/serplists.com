import { vi } from 'vitest';

import { PERSONAL_CONSOLE, type ConsoleContext } from '@/lib/consoleRoutes';

import { workspaceShowing } from './workspaceForContext';

export const shownConsole: { context: ConsoleContext } = { context: PERSONAL_CONSOLE };

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ consoleContext: shownConsole.context, activeWorkspace: workspaceShowing(shownConsole.context) }),
}));
