import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

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

import { useTemplateLists } from '@/contexts/TemplatesContext';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';

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

describe('catalog-only pages (the public library, categories and search) while the Organizations are unresolved', () => {
  beforeEach(() => {
    state.isAuthLoading = false;
    state.workspaceStatus = 'error';
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it.each(['error', 'loading'] as const)('shows the catalog when workspaceStatus is %s, since its key names no user or context', (status) => {
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
