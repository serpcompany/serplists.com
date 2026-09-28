import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

// The public library, category and search pages read only the catalog. Its key has no user or
// context, so a failed teams request (workspaceStatus 'error') must not keep it from loading:
// those pages sit outside the console's WorkspaceGate and would silently show only the bundled
// starters.

const state = vi.hoisted(() => ({
  isAuthLoading: false,
  workspaceStatus: 'error' as 'ready' | 'loading' | 'error',
}));

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: state.isAuthLoading }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    isWorkspaceLoading: state.isAuthLoading || state.workspaceStatus !== 'ready',
    workspaceScopeId: 'personal',
    workspaceStatus: state.workspaceStatus,
  }),
}));

import { TemplatesProvider, useTemplateLists } from '@/contexts/TemplatesContext';

const communityTemplate: ChecklistTemplate = {
  id: 'community-1',
  title: 'Community Audit Checklist',
  description: '',
  sections: [{ id: 'section-1', title: 'Audit', items: [{ id: 'item-1', title: 'Crawl the site' }] }],
  userId: 'someone-else',
  ownerProfile: { username: 'someone' },
  slug: 'community-audit-checklist',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: true,
  categories: [],
  tags: [],
  version: 1,
};

const clients: QueryClient[] = [];

function renderLibraryLists() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(['templates', 'catalog'], [communityTemplate]);
  let lists: ReturnType<typeof useTemplateLists> | undefined;
  const LibraryProbe = () => {
    lists = useTemplateLists({ catalog: true, workspace: false });
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TemplatesProvider>
        <LibraryProbe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  if (!lists) throw new Error('TemplatesProvider did not render');
  return lists;
}

describe('catalog-only pages while the Organizations are unresolved', () => {
  beforeEach(() => {
    state.isAuthLoading = false;
    state.workspaceStatus = 'error';
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it.each(['error', 'loading'] as const)('shows the catalog when workspaceStatus is %s', (status) => {
    state.workspaceStatus = status;
    const lists = renderLibraryLists();

    expect(lists.templatesLoading).toBe(false);
    expect(lists.templates.map((template) => template.id)).toContain('community-1');
  });

  it('still waits for the session before reporting the catalog loaded', () => {
    state.isAuthLoading = true;

    expect(renderLibraryLists().templatesLoading).toBe(true);
  });
});
