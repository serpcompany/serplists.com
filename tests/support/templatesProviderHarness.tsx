import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, vi } from 'vitest';

import type { useWorkspace } from '@/contexts/WorkspaceContext';
import type { ChecklistTemplate, TemplateSavePayload, TemplatesContextProps } from '@/types/checklist';

import { PERSONAL_WORKSPACE } from '../fixtures/workspaces';

export type TemplatesProviderWorkspace = Pick<
  ReturnType<typeof useWorkspace>,
  'activeTeamId' | 'isWorkspaceLoading' | 'workspaceScopeId' | 'workspaceStatus'
>;

export const providerWorkspace: TemplatesProviderWorkspace = {
  activeTeamId: undefined,
  isWorkspaceLoading: false,
  workspaceScopeId: 'personal',
  workspaceStatus: 'ready',
};

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeWorkspace: PERSONAL_WORKSPACE, isTeamWorkspace: false, ...providerWorkspace }),
}));

import { useTemplates } from '@/contexts/TemplatesContext';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';

export const launchChecklist = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
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
  ...overrides,
});

export const savePayloadOf = ({
  id, title, sections, isPublic, slug, seoUrl, description, type, seoTitle, seoDescription, rules, categories, tags, version,
}: ChecklistTemplate): TemplateSavePayload => ({
  id,
  title,
  sections,
  isPublic,
  slug,
  seoUrl,
  ...(description === undefined ? {} : { description }),
  ...(type === undefined ? {} : { type }),
  ...(seoTitle === undefined ? {} : { seoTitle }),
  ...(seoDescription === undefined ? {} : { seoDescription }),
  ...(rules === undefined ? {} : { rules }),
  ...(categories === undefined ? {} : { categories }),
  ...(tags === undefined ? {} : { tags }),
  ...(version === undefined ? {} : { version }),
});

export function aTemplatesProviderForEachTest() {
  const clients: QueryClient[] = [];
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });
  return function renderTemplatesProvider(seed: (client: QueryClient) => void = () => {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    seed(client);
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
  };
}
