import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate, TemplatesContextProps } from '@/types/checklist';

const apiMock = vi.hoisted(() => ({
  createChecklist: vi.fn(),
  createTemplate: vi.fn(),
  importTemplateBackup: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/contexts/WorkspaceContext', async () => {
  const { PERSONAL_WORKSPACE } = await import('../../fixtures/workspaces');
  return {
    useWorkspace: () => ({
      activeWorkspace: PERSONAL_WORKSPACE,
      activeTeamId: undefined,
      isTeamWorkspace: false,
      isWorkspaceLoading: false,
      workspaceScopeId: 'personal',
      workspaceStatus: 'ready',
    }),
  };
});

import { useTemplates } from '@/contexts/TemplatesContext';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';

const launchPlan: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch plan',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: false,
};

function theSignedOutProvider(): TemplatesContextProps {
  const seen: TemplatesContextProps[] = [];
  function Probe() {
    seen.push(useTemplates());
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  const [context] = seen;
  if (!context) throw new Error('TemplatesProvider did not render');
  return context;
}

describe('TemplatesProvider for a visitor who is not signed in', () => {
  it('creates no template, starts no run and imports nothing, and says the visitor must sign in', async () => {
    const context = theSignedOutProvider();

    await expect(context.createTemplate({ title: 'Quick list', sections: [], isPublic: false })).rejects.toThrow(
      'User must be logged in to create a template',
    );
    await expect(context.createRun({ templateId: 'template-1', template: launchPlan })).rejects.toThrow(
      'User must be logged in to create a run',
    );
    await expect(context.importTemplates([launchPlan])).rejects.toThrow('User must be logged in to import templates');
    expect(apiMock.createTemplate).not.toHaveBeenCalled();
    expect(apiMock.createChecklist).not.toHaveBeenCalled();
    expect(apiMock.importTemplateBackup).not.toHaveBeenCalled();
  });
});
