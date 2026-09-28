import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate, TemplatesContextProps } from '@/types/checklist';

// A template save must not wait for (or cause) a reload of the whole workspace list: the PUT
// answer carries the version the next save needs, and pages that show the list reload it
// when they mount.

const apiMock = vi.hoisted(() => ({ updateTemplate: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeTeamId: undefined, isWorkspaceLoading: false, workspaceScopeId: 'personal' }),
}));

import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(['templates', 'user-1', 'personal'], [template]);
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

const settledWithin = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise.then((value) => ({ value })), new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))]);

describe('updateTemplate', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    apiMock.updateTemplate.mockReset();
  });

  it('resolves with the stored version without reloading the workspace list', async () => {
    apiMock.updateTemplate.mockResolvedValue({ version: 4, slug: 'launch-checklist' });
    const { client, context } = renderProvider();
    // A page is showing the workspace list; the list request never answers.
    const listFetch = vi.fn(() => new Promise<ChecklistTemplate[]>(() => {}));
    const unsubscribe = new QueryObserver(client, {
      queryKey: ['templates', 'user-1', 'personal'],
      queryFn: listFetch,
      staleTime: 5 * 60 * 1000,
    }).subscribe(() => {});

    const outcome = await settledWithin(context.updateTemplate({ ...template, title: 'Launch Checklist v2' }), 200);

    expect(outcome).toEqual({ value: { version: 4, slug: 'launch-checklist' } });
    expect(listFetch).not.toHaveBeenCalled();
    // Pages that show the list reload it when they mount.
    expect(client.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    unsubscribe();
  });
});
