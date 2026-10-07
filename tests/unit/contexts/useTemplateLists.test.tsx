import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateLists } from '@/contexts/TemplatesContext';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';

import type { TemplatesProviderWorkspace } from '../../support/templatesProviderHarness';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: (): TemplatesProviderWorkspace => ({
    activeTeamId: 'team-1',
    isWorkspaceLoading: false,
    workspaceScopeId: 'team-1',
    workspaceStatus: 'ready',
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
  it('exposes the lists through templates and allTemplates', () => {
    expect(readTemplateListKeys()).toEqual(expect.arrayContaining(['templates', 'allTemplates', 'templatesLoading']));
  });

  it('offers no raw workspace list, whose copy of one template could be stale, to look a template up in', () => {
    expect(readTemplateListKeys()).not.toContain('workspaceTemplates');
  });
});
