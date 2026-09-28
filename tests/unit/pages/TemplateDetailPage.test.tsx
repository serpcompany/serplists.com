import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();
const { contextUpdateTemplate, switchProps, workspaceState, workspaceTemplates } = vi.hoisted(() => ({
  contextUpdateTemplate: vi.fn(),
  switchProps: [] as Array<Record<string, unknown>>,
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
    updateTemplate: contextUpdateTemplate,
    workspaceTemplates,
  });
  return { useTemplates, useTemplateLists: useTemplates };
});

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceState,
}));

// Captures the visibility switch's props so a test can flip it.
vi.mock('@/components/ui/switch', async () => {
  const { createElement } = await import('react');
  return {
    Switch: (props: Record<string, unknown>) => {
      switchProps.push(props);
      return createElement('button', {
        'aria-checked': String(props.checked),
        disabled: props.disabled,
        id: props.id,
        role: 'switch',
      });
    },
  };
});

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
  contextUpdateTemplate.mockReset();
  mockUseTemplateDetailModel.mockReset();
  switchProps.length = 0;
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

describe('TemplateDetail visibility', () => {
  it('shows the visibility of the template the model holds', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), isPublic: false },
    });

    const html = renderTemplateDetail();

    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('>Public<');
  });

  it('changes visibility through the model, which keeps the template and its version in step', async () => {
    const setVisibility = vi.fn().mockResolvedValue({ kind: 'ok' });
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), setVisibility });

    renderTemplateDetail();
    const onCheckedChange = switchProps.at(-1)?.onCheckedChange as (value: boolean) => Promise<void>;
    await onCheckedChange(false);

    expect(setVisibility).toHaveBeenCalledWith(false);
    expect(contextUpdateTemplate).not.toHaveBeenCalled();
  });
});

describe('TemplateDetail load failures', () => {
  it('offers a retry for a failed load instead of saying the template does not exist', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      loadError: 'HTTP 503',
      reload: vi.fn(),
      template: null,
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Unable to load template');
    expect(html).toContain('HTTP 503');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Template Not Found');
    expect(html).not.toContain('does not exist');
  });

  it('keeps the not found message for a template that is really missing', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      loadError: null,
      notFound: true,
      reload: vi.fn(),
      template: null,
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Template Not Found');
    expect(html).not.toContain('Try again');
  });
});

describe('TemplateDetail Changelog', () => {
  it('shows a restore and a Share next to the versions, without repeating a version', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      history: {
        data: {
          events: [
            {
              action: 'template.restored',
              actor: { name: 'Bob Editor' },
              createdAt: '2026-07-05T12:00:00.000Z',
              diff: { deleted_at: null, is_public: false },
              id: 'event-3',
            },
            {
              action: 'template.updated',
              actor: { name: 'John Example' },
              createdAt: '2026-07-04T12:00:00.000Z',
              diff: { is_public: true },
              id: 'event-2',
            },
            {
              action: 'template.created',
              actor: { name: 'John Example' },
              createdAt: '2026-07-03T12:00:00.000Z',
              id: 'event-1',
            },
          ],
          subject: { id: 'user-1', type: 'user' },
          templateId: 'tpl-1',
          versions: [
            {
              action: 'template.created',
              actor: { name: 'John Example' },
              createdAt: '2026-07-03T12:00:00.000Z',
              id: 'version-1',
              version: 1,
            },
          ],
        },
        isError: false,
        isLoading: false,
      },
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Restored template');
    expect(html).toContain('Bob Editor');
    expect(html).toContain('Made template public');
    expect(html).toContain('Created template v1');
    expect(html.match(/Created template/g)).toHaveLength(1);
    expect(html.indexOf('Restored template')).toBeLessThan(html.indexOf('Made template public'));
    expect(html.indexOf('Made template public')).toBeLessThan(html.indexOf('Created template v1'));
  });
});

describe('TemplateDetail stats', () => {
  // A row shaped like GET /api/templates/:id, mapped the way the model maps it.
  const apiTemplate = () =>
    mapApiTemplateToChecklistTemplate(
      {
        created_at: '2026-07-03T12:00:00.000Z',
        id: 'tpl-1',
        is_public: 0,
        items: JSON.stringify([
          { id: 's1', items: [{ id: 'i1', title: 'One' }, { id: 'i2', title: 'Two' }], title: 'First' },
          { id: 's2', items: [{ id: 'i3', title: 'Three' }], title: 'Second' },
        ]),
        slug: 'launch',
        title: 'Launch',
        updated_at: '2026-07-04T12:00:00.000Z',
        user_id: 'user-1',
        version: 3,
      },
      'launch',
    );
  const statLabels = (html: string) =>
    [...html.matchAll(/<p class="text-xs text-muted-foreground">([^<]+)<\/p>/g)].map(
      (match) => match[1],
    );

  it('shows only metrics the loaded template really has, never placeholder zeros', () => {
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), template: apiTemplate() });

    const html = renderTemplateDetail();
    const labels = statLabels(html);

    expect(labels).toContain('Total Tasks');
    expect(labels).not.toContain('Views');
    expect(labels).not.toContain('Copies');
    expect(labels).not.toContain('Runs');
    expect(html).toMatch(/>3<\/p><p class="text-xs text-muted-foreground">Total Tasks</);
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
    expect(html).toContain('Sections');
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
