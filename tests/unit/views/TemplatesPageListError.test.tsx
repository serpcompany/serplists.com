import '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

import { createTestQueryClient } from '../../fixtures/queryClient';

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    activeWorkspace: { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    workspaceScopeId: 'personal',
    workspaceStatus: 'ready',
  }),
}));

import { TemplatesProvider } from '@/contexts/TemplatesContext';
import Templates from '@/views/Templates';
import { navigation } from '../../support/nextNavigation';

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
  const client = createTestQueryClient();
  clients.push(client);
  client.setQueryData(['templates', 'catalog'], [myPublicTemplate]);
  await seedPersonalList(client);
  navigation.reset('/dashboard/templates');
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TemplatesProvider>
        <Templates />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
}

describe('My Templates when the Personal list fails, while the cached catalog still holds the user\'s public templates', () => {
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
