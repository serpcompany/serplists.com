import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();
const { workspaceTemplates } = vi.hoisted(() => ({
  workspaceTemplates: [] as unknown[],
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: unknown[]) =>
    mockUseTemplateDetailModel(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      email: 'john@example.com',
      id: 'user-1',
      username: 'designops',
    },
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => {
  const useTemplates = () => ({
    createRun: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    workspaceTemplates,
  });
  return { useTemplates, useTemplateLists: useTemplates };
});

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    canEditTemplates: true,
  }),
}));

vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequired: vi.fn(),
  navigateToLoginWithReturnPath: vi.fn(),
}));

const renderTemplateDetail = () =>
  renderToStaticMarkup(
    <StaticRouter location="/dashboard/templates/tpl-1">
      <Routes>
        <Route path="/dashboard/templates/:id" element={<TemplateDetail />} />
      </Routes>
    </StaticRouter>,
  );

const baseModel = () => ({
  billingState: { billingEnabled: true, isLoading: false, isPro: true },
  history: { data: null, isError: false, isLoading: false },
  loading: false,
  notFound: false,
  saveTemplate: vi.fn(),
  shareTemplate: vi.fn(),
  startRun: vi.fn(),
  template: buildV0DemoPrivateTemplate(),
});

describe('TemplateDetail page', () => {
  it('looks templates up in the workspace list, which refreshes after edits, never the catalog', () => {
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    renderTemplateDetail();

    const options = mockUseTemplateDetailModel.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(options.mode).toBe('private');
    expect(options.workspaceTemplates).toBe(workspaceTemplates);
    expect(options).not.toHaveProperty('getCachedTemplate');
  });

  it('renders the v0 private template detail structure with stats, structure, and metadata cards', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      billingState: {
        billingEnabled: false,
        isLoading: false,
        isPro: true,
      },
      loading: false,
      notFound: false,
      history: {
        data: {
          events: [],
          subject: { type: 'user', id: 'user-1' },
          templateId: 'tpl-1',
          versions: [
            {
              id: 'version-1',
              action: 'template.created',
              actor: { name: 'John Example' },
              contentHash: 'hash-1',
              createdAt: '2026-07-03T12:00:00.000Z',
              version: 1,
            },
          ],
        },
        isError: false,
        isLoading: false,
      },
      saveTemplate: vi.fn(),
      shareTemplate: vi.fn(),
      startRun: vi.fn(),
      template: buildV0DemoPrivateTemplate(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/dashboard/templates/tpl-1">
        <Routes>
          <Route
            path="/dashboard/templates/:id"
            element={<TemplateDetail />}
          />
        </Routes>
      </StaticRouter>,
    );

    expect(html).toContain('Product Launch Checklist');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-dashboard-scroll-area="true"');
    expect(html).toContain('Total Tasks');
    expect(html).toContain('Views');
    expect(html).toContain('Copies');
    expect(html).toContain('Runs');
    expect(html).toContain('Template Structure');
    expect(html).toContain('Details');
    expect(html).toContain('Categories &amp; Tags');
    expect(html).toContain('Changelog');
    expect(html).toContain('Created template v1');
    expect(html).toContain('John Example');
    expect(html).toContain('Start Run');
    expect(html).toContain('Share');
    expect(html).toContain('Edit');
    expect(html).not.toContain('New Template');
    expect(html).not.toContain('Import Template');
    expect(html).not.toContain('PublicTemplateContent');
  });
});
