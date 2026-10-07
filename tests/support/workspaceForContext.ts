import type { Workspace } from '@/contexts/WorkspaceContext';
import { PERSONAL_WORKSPACE_ID } from '@/contexts/workspaceSelection';
import type { ConsoleContext } from '@/lib/consoleRoutes';

export const workspaceShowing = (context: ConsoleContext): Workspace =>
  context.type === 'organization'
    ? {
        id: context.organizationId,
        type: 'team',
        teamId: context.organizationId,
        memberId: 'member-1',
        name: 'Acme',
        role: 'owner',
        slug: 'acme',
      }
    : { id: PERSONAL_WORKSPACE_ID, type: 'personal', name: 'Personal', role: 'owner' };
