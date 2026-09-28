import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PublicTemplate from '@/pages/PublicTemplate';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildConsoleTemplatePath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';
import { buildDefaultRunName, RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';
import type { ChecklistTemplate } from '@/types/checklist';

const {
  authState,
  mockCreateBillingCheckout,
  mockNavigate,
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
  mockNavigate: vi.fn(),
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
  },
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

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
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

function renderPublishedRoute(
  template: ChecklistTemplate,
  modelOverrides: Record<string, unknown> = {},
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
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://serplists.com/profile/alice/reviewed-clipy-checklist', origin: 'https://serplists.com' } },
  });
  const helmetContext: Record<string, unknown> = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location="/profile/alice/reviewed-clipy-checklist">
        <Routes>
          <Route path="/profile/:username/:templateSlug" element={<PublicTemplate />} />
        </Routes>
      </StaticRouter>
    </HelmetProvider>,
  );

  return { helmet: helmetContext.helmet as { meta: { toString(): string }; title: { toString(): string } }, html };
}

describe('PublicTemplate rendered route', () => {
  it('uses the SEO title and description saved with a published template', () => {
    const { helmet, html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).toContain('Reviewed Clipy Checklist');
    expect(helmet.title.toString()).toContain('Saved Clipy Search Title');
    expect(helmet.meta.toString()).toContain(
      'content="Saved Clipy search description with five actionable steps."',
    );
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

  it('falls back to the ordinary title and description when saved SEO fields are empty', () => {
    const { helmet } = renderPublishedRoute({
      ...publishedClipyTemplate,
      seoTitle: '',
      seoDescription: '',
    });

    expect(helmet.title.toString()).toContain('Reviewed Clipy Checklist');
    expect(helmet.meta.toString()).toContain('content="Persisted Clipy summary."');
  });
});

type CapturedViewProps = {
  canSaveTemplate: boolean;
  canStartRun: boolean;
  isCreatingRun: boolean;
  isSaving: boolean;
  onSaveTemplate: () => unknown;
  onStartRun: () => unknown;
};

const lastViewProps = (): CapturedViewProps =>
  mockViewProps.mock.calls[mockViewProps.mock.calls.length - 1]?.[0] as CapturedViewProps;

const ORGANIZATION_UPGRADE_MESSAGE =
  'This Organization needs a paid plan before using this feature.';

describe('PublicTemplate ownership context', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    mockNavigate.mockReset();
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

    expect(mockNavigate).toHaveBeenCalledWith(buildConsoleTemplatePath('clone-1'));
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
    mockNavigate.mockReset();
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
    expect(mockNavigate).toHaveBeenCalledTimes(1);

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
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('PublicTemplate Save', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    mockNavigate.mockReset();
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
    const { helmet } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: null,
      notFound: true,
      reload: vi.fn(),
      template: null,
    });

    expect(helmet.meta.toString()).toContain('name="robots" content="noindex, nofollow"');
    expect(helmet.title.toString()).toContain('Template not found');
  });

  it('keeps a template that failed to load indexable, since the failure may be temporary', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: 'HTTP 503',
      reload: vi.fn(),
      template: null,
    });

    expect(helmet.meta.toString()).not.toContain('noindex');
    expect(helmet.title.toString()).toContain('Unable to load template');
    expect(helmet.title.toString()).not.toContain('not found');
  });

  it('keeps a template that loaded indexable', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate);

    expect(helmet.meta.toString()).toContain('name="robots" content="index, follow"');
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
