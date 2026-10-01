import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  baseModel,
  hasEditLink,
  mockUseTemplateDetailModel,
  recordListsThePageAsksFor,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
  workspaceState,
} from '../../support/templateDetailPage';
import TemplateDetail from '@/views/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import { navigation } from '../../support/nextNavigation';

beforeEach(resetTemplateDetailPageMocks);

describe('TemplateDetail after the teams request failed', () => {
  const privateOrganizationTemplate = () => ({
    ...buildV0DemoPrivateTemplate(),
    isPublic: false,
    teamId: 'team-1',
    userId: 'someone-else',
  });

  it('says the Organizations could not load, with Retry, on a private Organization template', () => {
    workspaceState.teamsUnavailable = true;
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), template: privateOrganizationTemplate() });

    const html = renderTemplateDetail();

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toMatch(/>Retry</);
    expect(html).not.toMatch(/Start Run<\/button>/);
  });

  it('shows no error on a Personal template', () => {
    workspaceState.teamsUnavailable = true;
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    const html = renderTemplateDetail();

    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(html).toMatch(/Start Run<\/button>/);
  });
});

describe('TemplateDetail opened by slug', () => {
  const renderAt = (location: string) => {
    navigation.reset(location, { routes: ['/dashboard/templates/[id]'] });
    return renderToStaticMarkup(
      <TemplateDetail />,
    );
  };

  it('links Edit on a page opened by slug to the loaded template id, since the editor loads by id only', () => {
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    const html = renderAt('/dashboard/templates/product-launch-checklist/');

    expect(hasEditLink(html)).toBe(true);
    expect(html).not.toContain('/product-launch-checklist/edit');
  });

  it('keeps the id link when the page was opened by id', () => {
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    expect(hasEditLink(renderAt('/dashboard/templates/tpl-1/'))).toBe(true);
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

describe('TemplateDetail page', () => {
  it('loads only its own template, never the workspace list or the catalog', () => {
    recordListsThePageAsksFor.mockClear();
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    renderTemplateDetail();

    for (const [listOptions] of recordListsThePageAsksFor.mock.calls) {
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
      ...baseModel(),
      billingState: { billingEnabled: false, isLoading: false, isPro: true },
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
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Product Launch Checklist');
    expect(html).toContain('data-slot="detail-page"');
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/templates\/"[^>]*>My Templates<\/a>/);
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
      ...baseModel(),
      billingState: { billingEnabled: true, isError: true, isLoading: false, isPro: false },
      template: { ...buildV0DemoPrivateTemplate(), userId: 'someone-else' },
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Copy to My Templates');
  });

  const renderAs = (role: 'viewer' | 'runner' | 'editor', templateOverrides: Record<string, unknown>) => {
    workspaceState.activeTeamId = 'acme';
    workspaceState.canEditTemplates = role === 'editor';
    workspaceState.isTeamWorkspace = true;
    workspaceState.roles = { acme: role };
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: false, isLoading: false, isPro: true },
      template: { ...buildV0DemoPrivateTemplate(), ...templateOverrides },
    });

    return renderTemplateDetail();
  };

  it('offers an Organization viewer no Start Run, Copy or Edit on a private Organization Template', () => {
    const html = renderAs('viewer', { isPublic: false, teamId: 'acme', userId: 'someone-else' });

    expect(html).toContain('Product Launch Checklist');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('Copy to My Templates');
    expect(html).not.toContain('/edit/"');
  });

  it('takes Edit and Share away from a creator demoted to runner, but keeps Start Run', () => {
    const html = renderAs('runner', { isPublic: false, teamId: 'acme', userId: 'user-1' });

    expect(html).toContain('Start Run');
    expect(html).not.toContain('/edit/"');
    expect(html).not.toMatch(/>Share</);
  });

  it('lets an Organization editor edit the Organization Template', () => {
    const html = renderAs('editor', { isPublic: false, teamId: 'acme', userId: 'someone-else' });

    expect(html).toContain('Start Run');
    expect(html).toContain('/edit/"');
  });
});
