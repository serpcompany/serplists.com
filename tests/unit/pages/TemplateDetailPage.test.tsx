import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { templatePayloadSchema } from '../../../functions/api/utils/payloads';
import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import { handleUpgradeRequiredForContext } from '@/lib/access-flow';
import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();
const {
  contextCreateTemplate,
  contextUpdateTemplate,
  menuItemProps,
  mockUseTemplateLists,
  switchProps,
  workspaceState,
} = vi.hoisted(() => ({
  contextCreateTemplate: vi.fn(),
  contextUpdateTemplate: vi.fn(),
  menuItemProps: [] as Array<Record<string, unknown>>,
  mockUseTemplateLists: vi.fn(),
  switchProps: [] as Array<Record<string, unknown>>,
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    isTeamWorkspace: false,
  },
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
    createTemplate: contextCreateTemplate,
    deleteTemplate: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: contextUpdateTemplate,
  });
  // Records the lists a page asks for; a detail page must not load any.
  const useTemplateLists = (options?: Record<string, unknown>) => {
    mockUseTemplateLists(options);
    return useTemplates();
  };
  return { useTemplates, useTemplateLists };
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

// Renders the More menu open and captures each item's props so a test can pick one.
vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dropdown-menu')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    DropdownMenuItem: (props: Record<string, unknown>) => {
      menuItemProps.push(props);
      return createElement('div', { role: 'menuitem' }, props.children as React.ReactNode);
    },
    DropdownMenuSeparator: () => createElement('hr'),
  };
});

vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequiredForContext: vi.fn(),
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
  contextCreateTemplate.mockReset();
  contextUpdateTemplate.mockReset();
  menuItemProps.length = 0;
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

describe('TemplateDetail copy of a private Organization template', () => {
  // The API only clones public templates, so a copy button here could only fail.
  const privateOrganizationTemplate = (isPublic = false) => ({
    ...buildV0DemoPrivateTemplate(),
    isPublic,
    teamId: 'team-1',
    userId: 'someone-else',
  });

  it('offers no copy to a member viewing it from Personal', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to My Templates');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Start Run');
  });

  it('offers no copy to a Free member, so nobody is sent to checkout for it', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isLoading: false, isPro: false },
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Upgrade to copy template');
    expect(html).not.toContain('Copy to My Templates');
  });

  it('offers no copy from another Organization', () => {
    workspaceState.activeTeamId = 'team-2';
    workspaceState.isTeamWorkspace = true;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to Organization');
  });

  it('keeps the copy once the template is public', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(true),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Copy to My Templates');
  });
});

describe('TemplateDetail Duplicate', () => {
  const duplicateWithTitle = async (title: string) => {
    contextCreateTemplate.mockResolvedValue({ id: 'tpl-2' });
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), title },
    });

    renderTemplateDetail();
    const duplicate = menuItemProps.find((props) =>
      [props.children].flat(Infinity).includes('Duplicate'),
    );
    await (duplicate?.onClick as () => Promise<void>)();

    return contextCreateTemplate.mock.calls.at(-1)?.[0] as { title: string };
  };

  it('keeps the copy of a title near the limit within what the API accepts', async () => {
    const payload = await duplicateWithTitle('a'.repeat(158));

    expect(payload.title.length).toBeLessThanOrEqual(160);
    expect(payload.title.endsWith(' Copy')).toBe(true);
    expect(templatePayloadSchema.safeParse({ title: payload.title }).success).toBe(true);
  });

  it('names a short title copy "<title> Copy"', async () => {
    const payload = await duplicateWithTitle('Launch');

    expect(payload.title).toBe('Launch Copy');
  });
});

describe('TemplateDetail export after a failed plan check', () => {
  it('offers Export JSON, not an upgrade, and checks the plan again on click', async () => {
    vi.mocked(handleUpgradeRequiredForContext).mockClear();
    const refetchBilling = vi.fn();
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: true, isLoading: false, isPro: false },
      refetchBilling,
    });

    const html = renderTemplateDetail();
    const exportItem = menuItemProps.find((props) =>
      [props.children].flat(Infinity).includes('Export JSON'),
    );
    await (exportItem?.onClick as () => Promise<void>)();

    expect(html).not.toContain('Upgrade to export');
    expect(refetchBilling).toHaveBeenCalledTimes(1);
    expect(handleUpgradeRequiredForContext).not.toHaveBeenCalled();
  });
});

describe('TemplateDetail opened by slug', () => {
  // The page resolves a slug through the API, but the editor loads by id only.
  const renderAt = (location: string) =>
    renderToStaticMarkup(
      <StaticRouter location={location}>
        <Routes>
          <Route path="/dashboard/templates/:id" element={<TemplateDetail />} />
          <Route path="/console/templates/:id" element={<TemplateDetail />} />
        </Routes>
      </StaticRouter>,
    );

  it.each(['/dashboard/templates/product-launch-checklist', '/console/templates/product-launch-checklist'])(
    'links Edit on %s to the loaded template id',
    (location) => {
      mockUseTemplateDetailModel.mockReturnValue(baseModel());

      const html = renderAt(location);

      expect(hasEditLink(html)).toBe(true);
      expect(html).not.toContain('/product-launch-checklist/edit');
    },
  );

  it('keeps the id link when the page was opened by id', () => {
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    expect(hasEditLink(renderAt('/dashboard/templates/tpl-1'))).toBe(true);
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

describe('TemplateDetail dates', () => {
  // Node reads a bare 'YYYY-MM-DD HH:MM:SS' as local time; a zone far from UTC exposes that.
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('reads zoneless timestamps as UTC and never shows Invalid Date', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      history: {
        data: {
          events: [],
          subject: { id: 'user-1', type: 'user' },
          templateId: 'tpl-1',
          versions: [
            {
              action: 'template.created',
              actor: { name: 'John Example' },
              createdAt: '2026-07-05 20:30:00',
              id: 'version-1',
              version: 1,
            },
          ],
        },
        isError: false,
        isLoading: false,
      },
      template: {
        ...buildV0DemoPrivateTemplate(),
        createdAt: '2026-07-05 20:30:00',
        updatedAt: 'not a timestamp',
      },
    });

    // Some ICU versions put a narrow no-break space before AM/PM.
    const html = renderTemplateDetail().replace(/\u202f/g, ' ');

    // 20:30 UTC on July 5 is 05:30 on July 6 in Tokyo.
    expect(html).toContain('7/6/2026');
    expect(html).toContain('Jul 6, 2026, 5:30 AM');
    expect(html).not.toContain('7/5/2026');
    expect(html).not.toContain('Invalid Date');
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
  it('loads only its own template, never the workspace list or the catalog', () => {
    mockUseTemplateLists.mockClear();
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    renderTemplateDetail();

    // useTemplateLists() with no options fetches the whole workspace list with full content.
    for (const [listOptions] of mockUseTemplateLists.mock.calls) {
      expect(listOptions).toEqual(expect.objectContaining({ workspace: false }));
      expect(listOptions).not.toEqual(expect.objectContaining({ catalog: true }));
    }
    const options = mockUseTemplateDetailModel.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(options.mode).toBe('private');
    expect(options.identifier).toBe('tpl-1');
    expect(options).not.toHaveProperty('workspaceTemplates');
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

  it('does not offer an upgrade to copy when the plan could not be checked', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      billingState: {
        billingEnabled: true,
        isError: true,
        isLoading: false,
        isPro: false,
      },
      loading: false,
      notFound: false,
      history: { data: null, isError: false, isLoading: false },
      saveTemplate: vi.fn(),
      shareTemplate: vi.fn(),
      startRun: vi.fn(),
      template: { ...buildV0DemoPrivateTemplate(), userId: 'someone-else' },
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

    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Copy to My Templates');
  });
});
