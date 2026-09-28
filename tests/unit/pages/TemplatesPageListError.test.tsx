import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

// In Personal, My Templates merges the cached public catalog with the user's own list. When
// the Personal list fails on its first load, the merged list still holds the user's public
// templates from the catalog (cached after a visit to Runs, Import or Discover), so a check on
// the merged list's length hid the error and silently dropped the private templates.

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    isWorkspaceLoading: false,
    workspaceScopeId: 'personal',
    workspaceStatus: 'ready',
  }),
}));

import { TemplatesProvider } from '@/contexts/TemplatesContext';
import Templates from '@/pages/Templates';

const template = (overrides: Partial<ChecklistTemplate>): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Template',
  description: '',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Check' }] }],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: false,
  categories: [],
  tags: [],
  version: 1,
  ...overrides,
});

const myPublicTemplate = template({ id: 'mine-public', title: 'My Public Launch Checklist', isPublic: true });
const myPrivateTemplate = template({ id: 'mine-private', title: 'My Private Audit Checklist' });
const personalListKey = ['templates', 'user-1', 'personal'];
const failure = () => Promise.reject(new Error('HTTP 500'));

const clients: QueryClient[] = [];

async function renderMyTemplates(seedPersonalList: (client: QueryClient) => Promise<void>) {
  // retryOnMount: false stands in for this page's own load having failed: a server render
  // would otherwise report the errored query as loading again.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  clients.push(client);
  client.setQueryData(['templates', 'catalog'], [myPublicTemplate]);
  await seedPersonalList(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StaticRouter location="/dashboard/templates">
        <TemplatesProvider>
          <Templates />
        </TemplatesProvider>
      </StaticRouter>
    </QueryClientProvider>,
  );
}

describe('My Templates when the Personal list fails', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('shows the load error with Retry even though the catalog holds a public template of the user', async () => {
    const html = await renderMyTemplates(async (client) => {
      await client.prefetchQuery({ queryKey: personalListKey, queryFn: failure });
    });

    expect(html).toContain('Couldn&#x27;t load your templates');
    expect(html).toContain('Retry');
    expect(html).not.toContain('My Public Launch Checklist');
  });

  it('keeps the last good list when only a refetch failed', async () => {
    const html = await renderMyTemplates(async (client) => {
      client.setQueryData(personalListKey, [myPublicTemplate, myPrivateTemplate]);
      await client.prefetchQuery({ queryKey: personalListKey, queryFn: failure, staleTime: 0 });
      expect(client.getQueryState(personalListKey)?.status).toBe('error');
    });

    expect(html).toContain('My Private Audit Checklist');
    expect(html).toContain('My Public Launch Checklist');
    expect(html).not.toContain('Couldn&#x27;t load your templates');
  });
});
