import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import PublicTemplate from '@/views/PublicTemplate';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildConsoleTemplatePath,
  resolvePublicTemplateOwnerSlug,
  SITE_ORIGIN,
} from '@/lib/routes';
import { buildDefaultRunName, RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';

import { CANONICAL_ORIGIN } from '../../../functions/sitemap/shared';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const {
  authState,
  mockCreateBillingCheckout,
  mockToastError,
  mockToastSuccess,
  mockUseTemplateDetailModel,
  mockViewProps,
  workspaceState,
} = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    user: null as { id: string } | null,
  },
  mockCreateBillingCheckout: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockUseTemplateDetailModel: vi.fn(),
  mockViewProps: vi.fn(),
  workspaceState: {
    activeTeamId: undefined as string | undefined,
    canEditTemplates: true,
    canRunTemplates: true,
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    retryWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    workspaceStatus: 'ready' as 'ready' | 'loading' | 'error',
  },
}));

// A static render runs no effects, so the page never counts as shown and every late
// result would be ignored. These tests act as a user who is still on the page; leaving
// it is covered by tests/unit/lib/navigation/pageVisit.test.ts.
vi.mock('@/hooks/usePageVisit', () => ({
  usePageVisit: () => () => ({ isCurrent: () => true }),
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: unknown[]) => mockUseTemplateDetailModel(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    createRun: vi.fn(),
    createTemplate: vi.fn(),
    // An old catalog copy: the page must not show it in place of the server's.
    templates: [
      {
        id: 'clipy-template-1',
        slug: 'reviewed-clipy-checklist',
        title: 'Stale catalog title',
        isPublic: true,
        sections: [],
        userId: 'user-1',
        ownerProfile: { username: 'alice' },
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: { trackTemplateView: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  api: { createBillingCheckout: mockCreateBillingCheckout },
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock('@/components/template/PublicTemplateView', async (importOriginal) => {
  const { createElement } = await import('react');
  const actual = await importOriginal<
    typeof import('@/components/template/PublicTemplateView')
  >();
  return {
    PublicTemplateView: (
      props: React.ComponentProps<typeof actual.PublicTemplateView>,
    ) => {
      mockViewProps(props);
      return createElement(actual.PublicTemplateView, props);
    },
  };
});

const mockTemplates: ChecklistTemplate[] = [
  {
    id: 'template-1',
    slug: 'camping-checklist',
    title: 'Camping Checklist',
    isPublic: true,
    sections: [],
    userId: 'user-1',
    ownerProfile: { username: 'alice' },
    createdAt: '2026-03-24T00:00:00.000Z',
    description: '',
    categories: [],
    tags: [],
    updatedAt: '2026-03-24T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'legacy-template',
    title: 'Legacy Template',
    isPublic: true,
    sections: [],
    userId: 'user-1',
    ownerProfile: { username: 'alice' },
    createdAt: '2026-03-24T00:00:00.000Z',
    description: '',
    categories: [],
    tags: [],
    updatedAt: '2026-03-24T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'repo:ultimate-camping-checklist',
    slug: 'ultimate-camping-checklist',
    title: 'Ultimate Camping Checklist',
    isPublic: true,
    sections: [],
    userId: REPO_TEMPLATE_USER_ID,
    createdAt: '2026-03-24T00:00:00.000Z',
    description: '',
    categories: [],
    tags: [],
    updatedAt: '2026-03-24T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'template-4',
    slug: 'private-checklist',
    title: 'Private Template',
    isPublic: false,
    sections: [],
    userId: 'user-4',
    ownerProfile: { username: 'alice' },
    createdAt: '2026-03-24T00:00:00.000Z',
    description: '',
    categories: [],
    tags: [],
    updatedAt: '2026-03-24T00:00:00.000Z',
    version: 1,
  },
];

const resolveTemplateForRoute = (username: string, templateSlug: string) =>
  mockTemplates.find((template) => {
    if (!template.isPublic) {
      return false;
    }

    const ownerSlug = resolvePublicTemplateOwnerSlug(template);

    if (!ownerSlug || ownerSlug.toLowerCase() !== username.toLowerCase()) {
      return false;
    }

    return (
      template.slug === templateSlug ||
      (!template.slug && template.id === templateSlug)
    );
  });

describe('PublicTemplate route lookup', () => {
  it('matches a public template when both owner slug and template slug match', () => {
    expect(resolveTemplateForRoute('alice', 'camping-checklist')?.id).toBe(
      'template-1',
    );
  });

  it('falls back to template id for public templates that do not have a slug', () => {
    expect(resolveTemplateForRoute('alice', 'legacy-template')?.title).toBe(
      'Legacy Template',
    );
  });

  it('does not resolve a template when the owner segment does not match', () => {
    expect(resolveTemplateForRoute('bob', 'camping-checklist')).toBeUndefined();
  });

  it('maps repo-backed templates onto the official public owner slug', () => {
    expect(
      resolveTemplateForRoute(
        REPO_TEMPLATE_OWNER_SLUG,
        'ultimate-camping-checklist',
      )?.id,
    ).toBe('repo:ultimate-camping-checklist');
  });

  it('never resolves private templates on public owner/template routes', () => {
    expect(
      resolveTemplateForRoute('alice', 'private-checklist'),
    ).toBeUndefined();
  });
});

const publishedClipyTemplate: ChecklistTemplate = {
  id: 'clipy-template-1',
  slug: 'reviewed-clipy-checklist',
  title: 'Reviewed Clipy Checklist',
  description: 'Persisted Clipy summary.',
  seoTitle: 'Saved Clipy Search Title',
  seoDescription: 'Saved Clipy search description with five actionable steps.',
  isPublic: true,
  sections: [{
    id: 'steps',
    title: 'Steps',
    items: [{
      id: 'source',
      title: 'Watch the source recording',
      description: '',
      contents: [
        {
          type: 'text',
          value: '### Recording summary\nPersisted summary.\n\n### Transcript\nPersisted transcript.',
        },
        {
          type: 'video',
          uploadType: 'url',
          value: 'https://clipy.online/video/8fptqlnappr6',
        },
        {
          type: 'image',
          uploadType: 'url',
          value: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
        },
      ],
    }],
  }],
  userId: 'user-1',
  ownerProfile: { username: 'alice' },
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  categories: ['packing'],
  tags: ['Clipy'],
};

interface RouteVisit {
  path: string;
  origin: string;
  search?: string;
  hash?: string;
}

const CLEAN_VISIT: RouteVisit = {
  path: '/profile/alice/reviewed-clipy-checklist',
  origin: 'https://serplists.com',
};

// Sign-in and checkout read the page's own URL, as in the browser.
let restoreWindow: () => void = () => {};
beforeAll(() => {
  restoreWindow = navigation.installWindow();
});
afterAll(() => restoreWindow());

// The page's title, description, canonical URL and robots come from the server
// (tests/unit/server/pageMeta/templatePage.test.ts); the page adds a noindex tag only when
// it learns in the browser that the template is gone.
const robotsIn = (html: string) => html.match(/<meta name="robots" content="([^"]*)"/)?.[1];

function renderPublishedRoute(
  template: ChecklistTemplate,
  modelOverrides: Record<string, unknown> = {},
  visit: RouteVisit = CLEAN_VISIT,
) {
  mockUseTemplateDetailModel.mockReturnValue({
    billingState: { billingEnabled: true, isLoading: false, isPro: false },
    loading: false,
    notFound: false,
    saveTemplate: vi.fn(),
    startRun: vi.fn(),
    template,
    totalItems: 0,
    ...modelOverrides,
  });
  navigation.reset(`${visit.origin}${visit.path}${visit.search ?? ''}${visit.hash ?? ''}`, {
    routes: ['/profile/[username]/[templateSlug]'],
  });
  return { html: renderToStaticMarkup(<PublicTemplate />) };
}

describe('PublicTemplate rendered route', () => {
  it('renders the published template with its reviewed content and embeds', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).toContain('Reviewed Clipy Checklist');
    expect(html).toContain('Recording summary');
    expect(html).toContain('Persisted summary.');
    expect(html).toContain('Transcript');
    expect(html).toContain('Persisted transcript.');
    expect(html).toContain('src="https://clipy.online/embed/8fptqlnappr6?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(html).toContain('src="https://cdn.clipy.online/key-moments/demo/issues.jpg"');
    expect(html).toContain('href="https://clipy.online/video/8fptqlnappr6?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });

  it('adds no robots rule of its own to a template that loaded, on any host', () => {
    expect(robotsIn(renderPublishedRoute(publishedClipyTemplate).html)).toBeUndefined();
    const staging = renderPublishedRoute(publishedClipyTemplate, {}, {
      path: '/profile/Alice/reviewed-clipy-checklist',
      origin: 'https://staging.serplists.com',
      search: '?ref=x',
    });
    expect(robotsIn(staging.html)).toBeUndefined();
  });
});

type CapturedViewProps = {
  canSaveTemplate: boolean;
  canStartRun: boolean;
  isCreatingRun: boolean;
  isSaving: boolean;
  onSaveTemplate: () => unknown;
  onStartRun: () => unknown;
  workspaceError: { onContinueInPersonal: () => void; onRetry: () => void } | null;
};

const lastViewProps = (): CapturedViewProps =>
  mockViewProps.mock.calls[mockViewProps.mock.calls.length - 1]?.[0] as CapturedViewProps;

const ORGANIZATION_UPGRADE_MESSAGE =
  'This Organization needs a paid plan before using this feature.';

describe('PublicTemplate ownership context', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockUseTemplateDetailModel.mockReset();
    mockViewProps.mockReset();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
    workspaceState.activeTeamId = 'team-1';
    workspaceState.canEditTemplates = true;
    workspaceState.canRunTemplates = true;
    workspaceState.isTeamWorkspace = true;
    workspaceState.isWorkspaceLoading = false;
    workspaceState.retryWorkspace.mockReset();
    workspaceState.selectWorkspace.mockReset();
    workspaceState.workspaceStatus = 'ready';
  });

  it('loads billing, clone and run targets for the active Organization', () => {
    renderPublishedRoute(publishedClipyTemplate);

    expect(mockUseTemplateDetailModel).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', userId: 'user-1' }),
    );
  });

  it('loads the template itself instead of reading the in-memory catalog', () => {
    renderPublishedRoute(publishedClipyTemplate);

    const options = mockUseTemplateDetailModel.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual(
      expect.objectContaining({
        identifier: 'reviewed-clipy-checklist',
        mode: 'public',
        ownerUsername: 'alice',
      }),
    );
    expect(options).not.toHaveProperty('cachedTemplates');
  });

  it('keeps Personal as the context when no Organization is active', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;

    renderPublishedRoute(publishedClipyTemplate);

    const options = mockUseTemplateDetailModel.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toHaveProperty('teamId', undefined);
  });

  it('shows the Organization plan message instead of Personal checkout when a run hits the Organization limit', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastViewProps().onStartRun();

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('shows the Organization plan message instead of Personal checkout when Save needs a paid Organization', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(saveTemplate).toHaveBeenCalledTimes(1);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('still starts Personal checkout when Personal is active', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const startRun = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastViewProps().onStartRun();

    expect(mockCreateBillingCheckout).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('opens the saved copy so the user lands where it was saved', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(navigation.router.push).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe(buildConsoleTemplatePath('clone-1'));
  });

  it('labels Save as an upgrade for a Free Personal user, never in an Organization', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const personal = renderPublishedRoute(publishedClipyTemplate).html;

    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
    const organization = renderPublishedRoute(publishedClipyTemplate).html;

    expect(personal).toContain('Upgrade to copy template');
    expect(organization).not.toContain('Upgrade to');
    expect(organization).toContain('Copy to Library');
  });

  it('never labels Save as an upgrade when the plan check failed', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      billingState: { billingEnabled: true, isError: true, isLoading: false, isPro: false },
    });

    expect(html).not.toContain('Upgrade to');
    expect(html).toContain('Copy to Library');
  });

  it('says the copy went to the Organization, as the template detail page does', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(mockToastSuccess).toHaveBeenCalledWith('Template copied to this Organization');
  });

  it('still says the copy was saved to the account in Personal', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(mockToastSuccess).toHaveBeenCalledWith('Template saved to your account');
  });

  it('never offers Save to an Organization role that cannot add Templates', async () => {
    workspaceState.canEditTemplates = false;
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'error', message: 'Forbidden' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    expect(lastViewProps().canSaveTemplate).toBe(false);
    expect(html).not.toMatch(/>(Save|Copy to Library)</);
    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(false);
    expect(saveTemplate).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('keeps Start Run for a runner, who may start runs but not add Templates', () => {
    workspaceState.canEditTemplates = false;
    workspaceState.canRunTemplates = true;
    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(lastViewProps().canStartRun).toBe(true);
    expect(html).toContain('Start Run');
  });

  it('never offers Start Run to an Organization role that cannot start runs', async () => {
    workspaceState.canEditTemplates = false;
    workspaceState.canRunTemplates = false;
    const startRun = vi.fn().mockResolvedValue({ kind: 'error', message: 'Forbidden' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { startRun });

    expect(lastViewProps().canStartRun).toBe(false);
    expect(html).not.toContain('Start Run');
    await lastViewProps().onStartRun();
    expect(startRun).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('ignores Start Run and Save until the active Organization is known', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = true;
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { saveTemplate, startRun });

    await lastViewProps().onStartRun();
    await lastViewProps().onSaveTemplate();

    expect(startRun).not.toHaveBeenCalled();
    expect(saveTemplate).not.toHaveBeenCalled();
    const actionButtons = html.match(/<button[^>]*>(?:(?!<\/button>).)*(?:Start Run|Save|Copy to Library|Upgrade to)(?:(?!<\/button>).)*<\/button>/g) ?? [];
    expect(actionButtons.length).toBeGreaterThanOrEqual(4);
    for (const button of actionButtons) {
      expect(button).toContain('disabled=""');
    }
  });

  // The public shell has no WorkspaceGate, so the page offers the gate's way out itself.
  it('offers Retry and Continue in Personal when the Organizations failed to load', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = true;
    workspaceState.workspaceStatus = 'error';

    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    const { workspaceError } = lastViewProps();
    workspaceError?.onRetry();
    expect(workspaceState.retryWorkspace).toHaveBeenCalledTimes(1);
    workspaceError?.onContinueInPersonal();
    expect(workspaceState.selectWorkspace).toHaveBeenCalledWith('personal');
  });

  it('shows no Organizations error while they load, or to a signed-out visitor', () => {
    workspaceState.isWorkspaceLoading = true;
    workspaceState.workspaceStatus = 'loading';
    expect(renderPublishedRoute(publishedClipyTemplate).html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(lastViewProps().workspaceError).toBeNull();

    authState.isAuthenticated = false;
    authState.user = null;
    workspaceState.workspaceStatus = 'error';
    expect(renderPublishedRoute(publishedClipyTemplate).html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(lastViewProps().workspaceError).toBeNull();
  });
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

describe('PublicTemplate Start Run', () => {
  beforeEach(() => {
    mockToastError.mockReset();
    mockUseTemplateDetailModel.mockReset();
    mockViewProps.mockReset();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
    workspaceState.activeTeamId = undefined;
    workspaceState.canEditTemplates = true;
    workspaceState.canRunTemplates = true;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = false;
  });

  it('creates one run when Start Run is clicked twice before the first finishes', async () => {
    const pending = deferred<{ kind: 'ok'; runId: string }>();
    const startRun = vi.fn().mockReturnValue(pending.promise);
    renderPublishedRoute(publishedClipyTemplate, { startRun });
    const { onStartRun } = lastViewProps();

    const first = onStartRun();
    const second = onStartRun();
    pending.resolve({ kind: 'ok', runId: 'run-1' });
    await Promise.all([first, second]);

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);

    startRun.mockResolvedValue({ kind: 'ok', runId: 'run-2' });
    await onStartRun();
    expect(startRun).toHaveBeenCalledTimes(2);
  });

  it('allows another Start Run after a failed attempt', async () => {
    const startRun = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'error', message: 'Failed to start template run' })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });
    const { onStartRun } = lastViewProps();

    await onStartRun();
    await expect(onStartRun()).rejects.toThrow('network down');
    await onStartRun();

    expect(startRun).toHaveBeenCalledTimes(3);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
  });
});

describe('PublicTemplate Save', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    mockToastError.mockReset();
    mockUseTemplateDetailModel.mockReset();
    mockViewProps.mockReset();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
    workspaceState.activeTeamId = undefined;
    workspaceState.canEditTemplates = true;
    workspaceState.canRunTemplates = true;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = false;
  });

  it.each([
    ['an error', { kind: 'error', message: 'Checking your plan. Try again in a moment.' }, true],
    ['an upgrade that redirects to checkout', { kind: 'upgrade_required' }, true],
    ['an upgrade while billing is unavailable', { kind: 'upgrade_required' }, false],
    ['a login redirect', { kind: 'login_required' }, true],
  ])('reports %s as not saved', async (_label, result, billingEnabled) => {
    const saveTemplate = vi.fn().mockResolvedValue(result);
    renderPublishedRoute(publishedClipyTemplate, {
      billingState: { billingEnabled, isLoading: false, isPro: false },
      saveTemplate,
    });

    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(false);
    expect(saveTemplate).toHaveBeenCalledTimes(1);
  });

  it('reports a successful save as saved', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(true);
  });

  it('saves once when Save is clicked twice before the first finishes', async () => {
    const pending = deferred<{ kind: 'ok'; templateId: string }>();
    const saveTemplate = vi.fn().mockReturnValue(pending.promise);
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });
    const { onSaveTemplate } = lastViewProps();

    const first = onSaveTemplate();
    const second = onSaveTemplate();
    pending.resolve({ kind: 'ok', templateId: 'clone-1' });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(saveTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('PublicTemplate load failures', () => {
  it('offers a retry for a failed load instead of saying the template is gone', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: 'HTTP 503',
      reload: vi.fn(),
      template: null,
    });

    expect(html).toContain('Unable to load template');
    expect(html).toContain('HTTP 503');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Template not found');
    expect(html).not.toContain('no longer');
  });

  it('keeps the not found message for a template that is really missing', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: null,
      notFound: true,
      reload: vi.fn(),
      template: null,
    });

    expect(html).toContain('Template not found');
    expect(html).not.toContain('Try again');
  });

  it('tells search engines to drop a template that is gone', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: null,
      notFound: true,
      reload: vi.fn(),
      template: null,
    });

    expect(robotsIn(html)).toBe('noindex, nofollow');
  });

  it('keeps a template that failed to load indexable, since the failure may be temporary', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: 'HTTP 503',
      reload: vi.fn(),
      template: null,
    });

    expect(robotsIn(html)).toBeUndefined();
    expect(html).not.toContain('noindex');
  });

  it('keeps a template that loaded indexable', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).not.toContain('noindex');
  });
});

describe('PublicTemplate default run name', () => {
  beforeEach(() => {
    mockUseTemplateDetailModel.mockReset();
    mockViewProps.mockReset();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
    workspaceState.isWorkspaceLoading = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the run within the API limit for a template title at the limit', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(
      { ...publishedClipyTemplate, title: 'T'.repeat(RUN_TITLE_MAX_LENGTH) },
      { startRun },
    );

    await lastViewProps().onStartRun();

    const runName = startRun.mock.calls[0]?.[0] as string;
    expect(runName.length).toBeLessThanOrEqual(RUN_TITLE_MAX_LENGTH);
    expect(runName.startsWith('TTT')).toBe(true);
  });

  it('names the run with the default My Templates and template detail give', async () => {
    const now = new Date('2026-09-28T10:15:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastViewProps().onStartRun();

    expect(startRun).toHaveBeenCalledWith(
      buildDefaultRunName(publishedClipyTemplate.title, now),
    );
    expect(startRun.mock.calls[0]?.[0]).toBe(
      `${publishedClipyTemplate.title} - ${now.toLocaleString()}`,
    );
  });
});

// The canonical URL comes from the server (tests/unit/server/pageMeta/templatePage.test.ts),
// which names the production site, as the sitemap does.
describe('PublicTemplate canonical URL', () => {
  it('shares its origin with the sitemap', () => {
    expect(SITE_ORIGIN).toBe(CANONICAL_ORIGIN);
  });
});
