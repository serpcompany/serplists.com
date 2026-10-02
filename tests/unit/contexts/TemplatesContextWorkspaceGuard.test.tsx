import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate, TemplatesContextProps } from '@/types/checklist';

const apiMock = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  createChecklist: vi.fn(),
  importTemplateBackup: vi.fn(),
}));
const workspaceState = vi.hoisted(() => ({ status: 'error' as 'ready' | 'loading' | 'error' }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    isWorkspaceLoading: workspaceState.status !== 'ready',
    workspaceScopeId: 'personal',
    workspaceStatus: workspaceState.status,
  }),
}));

import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';
import { WORKSPACE_NOT_READY_MESSAGE } from '@/contexts/workspaceSelection';

const template = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Confirm owner' }] }],
  userId: 'someone-else',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: true,
  categories: [],
  tags: [],
  version: 1,
  ...overrides,
});

const clients: QueryClient[] = [];

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  let context: TemplatesContextProps | undefined;
  const Probe = () => {
    context = useTemplates();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  if (!context) throw new Error('TemplatesProvider did not render');
  return context;
}

describe.each(['loading', 'error'] as const)('writes while the stored Organization is unconfirmed (%s) and the context shows Personal only for display', (status) => {
  beforeEach(() => {
    workspaceState.status = status;
    apiMock.createTemplate.mockReset().mockResolvedValue({ id: 'template-2' });
    apiMock.createChecklist.mockReset().mockResolvedValue({ id: 'run-1' });
    apiMock.importTemplateBackup.mockReset().mockResolvedValue({ imported: 1 });
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('refuses a new template for the active context instead of creating it in Personal', async () => {
    const context = renderProvider();

    await expect(context.createTemplate(template())).rejects.toThrow(WORKSPACE_NOT_READY_MESSAGE);
    expect(apiMock.createTemplate).not.toHaveBeenCalled();
  });

  it('refuses to start a run of a public template in the active context', async () => {
    const context = renderProvider();

    await expect(context.createRun({ templateId: 'template-1', template: template() })).rejects.toThrow(
      WORKSPACE_NOT_READY_MESSAGE,
    );
    expect(apiMock.createChecklist).not.toHaveBeenCalled();
  });

  it('refuses an import into the active context', async () => {
    const context = renderProvider();

    await expect(context.importTemplates([template()])).rejects.toThrow(WORKSPACE_NOT_READY_MESSAGE);
    expect(apiMock.importTemplateBackup).not.toHaveBeenCalled();
  });

  it('still runs a private Organization template, which always goes to its own Organization', async () => {
    const context = renderProvider();

    const run = await context.createRun({
      templateId: 'template-1',
      template: template({ isPublic: false, teamId: 'acme' }),
    });

    expect(run?.id).toBe('run-1');
    expect(apiMock.createChecklist).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'acme' }));
  });

  it('still copies a template into an explicitly named Organization', async () => {
    const context = renderProvider();

    await context.createTemplate({ ...template(), teamId: 'acme' });

    expect(apiMock.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'acme' }));
  });
});

describe('writes once the context is known', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('creates in Personal when Personal is the confirmed context', async () => {
    workspaceState.status = 'ready';
    apiMock.createTemplate.mockReset().mockResolvedValue({ id: 'template-2' });
    const context = renderProvider();

    await context.createTemplate(template());

    expect(apiMock.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ teamId: undefined }));
  });
});
