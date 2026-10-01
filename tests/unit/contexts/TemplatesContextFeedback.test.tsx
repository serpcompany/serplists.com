import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate, TemplatesContextProps } from '@/types/checklist';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiMock = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  createChecklist: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeTeamId: undefined, isWorkspaceLoading: false, workspaceScopeId: 'personal' }),
}));

import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';
import { getTemplateSaveSuccessMessage } from '@/features/template-editor/useTemplateEditorModel';

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Confirm owner' }] }],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: false,
  categories: [],
  tags: [],
  version: 3,
};

const clients: QueryClient[] = [];

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(['templates', 'user-1', 'personal'], [template]);
  client.setQueryData(['runs', 'user-1', 'personal'], []);
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
  return { client, context };
}

const isInvalidated = (client: QueryClient, key: unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

const expectNoToasts = () => {
  expect(toastMock.success).not.toHaveBeenCalled();
  expect(toastMock.error).not.toHaveBeenCalled();
};

describe('TemplatesProvider mutations leave feedback to the page', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    apiMock.createTemplate.mockReset();
    apiMock.updateTemplate.mockReset();
    apiMock.createChecklist.mockReset();
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('creates a template without a toast and still refreshes the lists', async () => {
    apiMock.createTemplate.mockResolvedValue({ id: 'template-2', slug: 'launch-checklist-2' });
    const { client, context } = renderProvider();

    const created = await context.createTemplate({ ...template, title: 'Copy' });

    expect(created.id).toBe('template-2');
    expectNoToasts();
    expect(isInvalidated(client, ['templates', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed template create to the caller without a toast', async () => {
    apiMock.createTemplate.mockRejectedValue(new Error('Template limit reached'));
    const { context } = renderProvider();

    await expect(context.createTemplate({ ...template })).rejects.toThrow('Template limit reached');
    expectNoToasts();
  });

  it('updates a template (such as a visibility toggle) without a toast', async () => {
    apiMock.updateTemplate.mockResolvedValue({ id: 'template-1', version: 4 });
    const { client, context } = renderProvider();

    await context.updateTemplate({ ...template, isPublic: true });

    expectNoToasts();
    expect(isInvalidated(client, ['templates', 'user-1', 'personal'])).toBe(true);
  });

  it('leaves the run lists as they are after a metadata-only save, which reconciles no runs', async () => {
    apiMock.updateTemplate.mockResolvedValue({ id: 'template-1', version: 4 });
    const { client, context } = renderProvider();

    await context.updateTemplate({ ...template, isPublic: true });

    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(false);
  });

  it('refreshes the run lists when the save changed the checklist structure', async () => {
    apiMock.updateTemplate.mockResolvedValue({
      id: 'template-1',
      version: 4,
      structureChanged: true,
      reconciledRuns: 2,
    });
    const { client, context } = renderProvider();

    await context.updateTemplate({ ...template });

    expectNoToasts();
    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed template update to the caller without a toast', async () => {
    apiMock.updateTemplate.mockRejectedValue(new Error('Version conflict'));
    const { context } = renderProvider();

    await expect(context.updateTemplate({ ...template, isPublic: true })).rejects.toThrow('Version conflict');
    expectNoToasts();
  });

  it('starts a run without a toast and still marks the run lists stale', async () => {
    apiMock.createChecklist.mockResolvedValue({ id: 'run-1' });
    const { client, context } = renderProvider();

    const run = await context.createRun({ templateId: 'template-1', template });

    expect(run?.id).toBe('run-1');
    expectNoToasts();
    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed run start (such as the run limit) to the caller without a toast', async () => {
    apiMock.createChecklist.mockRejectedValue(new Error('Run limit reached'));
    const { context } = renderProvider();

    await expect(context.createRun({ templateId: 'template-1', template })).rejects.toThrow('Run limit reached');
    expectNoToasts();
  });
});

describe('template editor save feedback', () => {
  it('toasts once for a successful create or update, and never for a failed save, which the editor shows inline', () => {
    const ok = { success: true, errors: [] };
    const failed = { success: false, errors: [{ type: 'save', message: 'Version conflict' }] };

    expect(getTemplateSaveSuccessMessage({ result: ok })).toBe('Template created');
    expect(getTemplateSaveSuccessMessage({ id: 'template-1', result: ok })).toBe('Template saved');
    expect(getTemplateSaveSuccessMessage({ id: 'template-1', result: failed })).toBeNull();
    expect(getTemplateSaveSuccessMessage({ result: failed })).toBeNull();
  });
});

describe('TemplatesContext feedback guard', () => {
  it('does not import toasts, so shared mutations cannot duplicate page feedback', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../../src/contexts/TemplatesContext.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"]sonner['"]/);
  });
});
