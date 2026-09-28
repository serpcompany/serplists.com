import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplatesProvider, useTemplateLists } from '@/contexts/TemplatesContext';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: 'team-1',
    isWorkspaceLoading: false,
    workspaceScopeId: 'team-1',
  }),
}));

vi.mock('@/lib/api', () => ({
  api: { getChecklists: vi.fn(), getTemplates: vi.fn() },
}));

const readTemplateListKeys = (): string[] => {
  let keys: string[] = [];
  const Probe = () => {
    keys = Object.keys(useTemplateLists({ workspace: false }));
    return null;
  };

  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );

  return keys;
};

describe('useTemplateLists', () => {
  it('exposes the lists through templates and allTemplates only', () => {
    const keys = readTemplateListKeys();

    expect(keys).toEqual(expect.arrayContaining(['templates', 'allTemplates', 'templatesLoading']));
    // A raw workspace list invites using it as a lookup cache for one template, which
    // serves stale copies; the detail page loads a template by id instead.
    expect(keys).not.toContain('workspaceTemplates');
  });
});
