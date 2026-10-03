import { vi } from 'vitest';

import { PERSONAL_CONSOLE, type ConsoleContext } from '@/lib/consoleRoutes';

export const shownConsole: { context: ConsoleContext } = { context: PERSONAL_CONSOLE };

vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ consoleContext: shownConsole.context }) }));
