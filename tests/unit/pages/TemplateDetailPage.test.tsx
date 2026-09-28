import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();
const { workspaceState, workspaceTemplates } = vi.hoisted(() => ({
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    isTeamWorkspace: false,
  },
  workspaceTemplates: [] as unknown[],
}));

// The real model derives permissions from the options the page passes; so does this mock.
vi.mock('@/features/template-detail/useTemplateDetailModel', async () => {
  const { getTemplateDetailPermissions } = await import(
    '@/features/template-detail/templatePermissions'
  );
  return {
    useTemplateDetailModel: (options: {
      canEditTemplates: boolean;
      teamId?: string;
      userId?: string;
    }) => {
      const model = mockUseTemplateDetailModel(options);
      return {
        permissions: getTemplateDetailPermissions({
          activeTeamId: options.teamId,
          canEditTemplates: options.canEditTemplates,
          template: model.template,
          userId: options.userId,
        }),
        ...model,
      };
    },
  };
});

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
  useWorkspace: () => workspaceState,
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

beforeEach(() => {
  mockUseTemplateDetailModel.mockReset();
  workspaceState.activeTeamId = undefined;
  workspaceState.canEditTemplates = true;
  workspaceState.isTeamWorkspace = false;
});

const hasShareButton = (html: string) => /Share<\/button>/.test(html);
const hasEditLink = (html: string) => html.includes('href="/dashboard/templates/tpl-1/edit"');
const isVisibilitySwitchDisabled = (html: string) =>
  /<button[^>]*id="template-visibility"[^>]*>/.exec(html)?.[0].includes('disabled=""') ?? false;

describe('TemplateDetail Organization permissions', () => {
  beforeEach(() => {
    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
  });

  it('gives a Creator whose role no longer allows editing no edit controls', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), teamId: 'team-1', userId: 'user-1' },
    });

    const html = renderTemplateDetail();

    expect(hasShareButton(html)).toBe(false);
    expect(hasEditLink(html)).toBe(false);
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(isVisibilitySwitchDisabled(html)).toBe(true);
  });

  it('gives an Organization editor who did not create the template Share and Edit', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), teamId: 'team-1', userId: 'someone-else' },
    });

    const html = renderTemplateDetail();

    expect(hasShareButton(html)).toBe(true);
    expect(hasEditLink(html)).toBe(true);
    expect(isVisibilitySwitchDisabled(html)).toBe(false);
  });

  it('passes the active role to the model, which guards Share and history with it', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    renderTemplateDetail();

    expect(mockUseTemplateDetailModel).toHaveBeenCalledWith(
      expect.objectContaining({ canEditTemplates: false, teamId: 'team-1', userId: 'user-1' }),
    );
  });
});

describe('TemplateDetail copy into an Organization', () => {
  const otherUsersPublicTemplate = () => ({
    ...buildV0DemoPrivateTemplate(),
    isPublic: true,
    userId: 'someone-else',
  });

  beforeEach(() => {
    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
  });

  it("offers the copy although the Organization's plan is Free", () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isLoading: false, isPro: false },
      template: otherUsersPublicTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Copy to Organization');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).not.toContain('Copy to My Templates');
  });

  it('hides the copy from roles that cannot add Templates to the Organization', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: otherUsersPublicTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Start Run');
  });
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
