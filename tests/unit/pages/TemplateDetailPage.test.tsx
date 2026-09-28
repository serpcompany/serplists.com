import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();

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
  });
  return { useTemplates, useTemplateLists: useTemplates };
});

const workspaceState = vi.hoisted(() => ({
  activeTeamId: undefined as string | undefined,
  roles: {} as Record<string, 'viewer' | 'runner' | 'editor'>,
}));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      activeTeamId: workspaceState.activeTeamId,
      canEditTemplates: true,
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceState.roles[id]),
      isTeamWorkspace: Boolean(workspaceState.activeTeamId),
    }),
  };
});

vi.mock('@/lib/access-flow', () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

describe('TemplateDetail page', () => {
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

  const renderAs = (role: 'viewer' | 'runner' | 'editor', templateOverrides: Record<string, unknown>) => {
    workspaceState.activeTeamId = 'acme';
    workspaceState.roles = { acme: role };
    mockUseTemplateDetailModel.mockReturnValue({
      billingState: { billingEnabled: false, isLoading: false, isPro: true },
      loading: false,
      notFound: false,
      history: { data: null, isError: false, isLoading: false },
      saveTemplate: vi.fn(),
      shareTemplate: vi.fn(),
      startRun: vi.fn(),
      template: { ...buildV0DemoPrivateTemplate(), ...templateOverrides },
    });

    return renderToStaticMarkup(
      <StaticRouter location="/dashboard/templates/tpl-1">
        <Routes>
          <Route path="/dashboard/templates/:id" element={<TemplateDetail />} />
        </Routes>
      </StaticRouter>,
    );
  };

  it('offers an Organization viewer no Start Run, Copy or Edit on a private Organization Template', () => {
    const html = renderAs('viewer', { isPublic: false, teamId: 'acme', userId: 'someone-else' });

    expect(html).toContain('Product Launch Checklist');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('Copy to My Templates');
    expect(html).not.toContain('/edit"');
  });

  it('takes Edit and Share away from a creator demoted to runner, but keeps Start Run', () => {
    const html = renderAs('runner', { isPublic: false, teamId: 'acme', userId: 'user-1' });

    expect(html).toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toMatch(/>Share</);
  });

  it('lets an Organization editor edit the Organization Template', () => {
    const html = renderAs('editor', { isPublic: false, teamId: 'acme', userId: 'someone-else' });

    expect(html).toContain('Start Run');
    expect(html).toContain('/edit"');
  });
});

