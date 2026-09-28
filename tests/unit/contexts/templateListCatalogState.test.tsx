import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplatesProvider, useTemplateLists } from '@/contexts/TemplatesContext';
import { repoTemplates } from '@/lib/repoTemplateCatalog';

const mockGetTemplates = vi.fn();
const workspaceState = { isWorkspaceLoading: false };

vi.mock('@/lib/api', () => ({
  api: { getTemplates: (...args: unknown[]) => mockGetTemplates(...args) },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    isWorkspaceLoading: workspaceState.isWorkspaceLoading,
    workspaceScopeId: 'personal',
  }),
}));

type Lists = ReturnType<typeof useTemplateLists>;
const CATALOG_KEY = ['templates', 'catalog'];

// A public discovery page: the catalog only, no workspace list.
const renderCatalogPage = (client: QueryClient): Lists => {
  let captured: Lists | undefined;
  const Probe = () => {
    captured = useTemplateLists({ catalog: true, workspace: false });
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  if (!captured) throw new Error('useTemplateLists did not render');
  return captured;
};

// Each server render mounts a fresh observer; retryOnMount: false makes the second render see
// the settled query the way an already-mounted page does, instead of an optimistic retry.
const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });

describe('useTemplateLists catalog state', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = newClient();
    workspaceState.isWorkspaceLoading = false;
    mockGetTemplates.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  it('treats the catalog as pending while the session and workspace load, although bundled templates are listed', () => {
    workspaceState.isWorkspaceLoading = true;

    const lists = renderCatalogPage(client);

    expect(lists.templates.length).toBeGreaterThanOrEqual(repoTemplates.length);
    expect(lists.catalogPending).toBe(true);
    expect(lists.catalogError).toBe(false);
  });

  it('treats the catalog as pending while its first request is in flight', () => {
    mockGetTemplates.mockReturnValue(new Promise(() => undefined));

    expect(renderCatalogPage(client).catalogPending).toBe(true);
  });

  it('shows a cached catalog at once, even when it is stale and refetching', () => {
    client.setQueryData(CATALOG_KEY, [], { updatedAt: 0 });

    const lists = renderCatalogPage(client);

    expect(lists.catalogPending).toBe(false);
    expect(lists.catalogError).toBe(false);
  });

  it('puts a failed catalog request into an error state instead of caching an empty catalog', async () => {
    mockGetTemplates.mockRejectedValue(new Error('Network down'));
    renderCatalogPage(client);
    const query = client.getQueryCache().find({ queryKey: CATALOG_KEY });
    expect(query).toBeDefined();

    await expect(query!.fetch()).rejects.toThrow('Network down');

    const lists = renderCatalogPage(client);
    expect(lists.catalogPending).toBe(false);
    expect(lists.catalogError).toBe(true);
    expect(lists.templates.length).toBe(repoTemplates.length);
  });
});
