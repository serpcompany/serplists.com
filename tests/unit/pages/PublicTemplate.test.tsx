import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicTemplate from '@/pages/PublicTemplate';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateDetailModel = vi.fn();
const mocks = vi.hoisted(() => ({
  handleUpgradeRequiredForContext: vi.fn(),
  isTeamWorkspace: false,
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: vi.fn(),
  viewProps: null as null | {
    onSaveTemplate: () => Promise<void> | void;
    onStartRun: () => Promise<void> | void;
  },
}));

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: unknown[]) => mockUseTemplateDetailModel(...args),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ isTeamWorkspace: mocks.isTeamWorkspace }),
}));

vi.mock('@/lib/access-flow', () => ({
  handleUpgradeRequiredForContext: mocks.handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath: mocks.navigateToLoginWithReturnPath,
  startBillingCheckout: mocks.startBillingCheckout,
}));

// Render the real view, but keep its handlers so tests can press its buttons.
vi.mock('@/components/template/PublicTemplateView', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/components/template/PublicTemplateView')
  >();
  return {
    PublicTemplateView: (
      props: React.ComponentProps<typeof actual.PublicTemplateView>,
    ) => {
      mocks.viewProps = props;
      return React.createElement(actual.PublicTemplateView, props);
    },
  };
});

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    createRun: vi.fn(),
    createTemplate: vi.fn(),
    templates: [],
  }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: { trackTemplateView: vi.fn() },
}));

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
  model: Record<string, unknown> = {},
) {
  mockUseTemplateDetailModel.mockReturnValue({
    billingState: { billingEnabled: true, isLoading: false, isPro: false },
    loading: false,
    notFound: false,
    saveTemplate: vi.fn(),
    startRun: vi.fn(),
    template,
    totalItems: 0,
    ...model,
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

describe('PublicTemplate plan limits', () => {
  afterEach(() => {
    mocks.handleUpgradeRequiredForContext.mockReset();
    mocks.startBillingCheckout.mockReset();
    mocks.isTeamWorkspace = false;
    mocks.viewProps = null;
  });

  it('shows the Organization-plan flow, not a Personal checkout, when an Organization run hits its limit', async () => {
    mocks.isTeamWorkspace = true;
    renderPublishedRoute(publishedClipyTemplate, {
      startRun: vi.fn().mockResolvedValue({ kind: 'upgrade_required' }),
    });

    await mocks.viewProps?.onStartRun();

    expect(mocks.handleUpgradeRequiredForContext).toHaveBeenCalledTimes(1);
    expect(mocks.handleUpgradeRequiredForContext).toHaveBeenCalledWith({
      billingEnabled: true,
      isTeamWorkspace: true,
    });
    expect(mocks.startBillingCheckout).not.toHaveBeenCalled();
  });

  it('sends a Personal run limit through the same context-aware upgrade flow', async () => {
    renderPublishedRoute(publishedClipyTemplate, {
      startRun: vi.fn().mockResolvedValue({ kind: 'upgrade_required' }),
    });

    await mocks.viewProps?.onStartRun();

    expect(mocks.handleUpgradeRequiredForContext).toHaveBeenCalledWith({
      billingEnabled: true,
      isTeamWorkspace: false,
    });
    expect(mocks.startBillingCheckout).not.toHaveBeenCalled();
  });

  it('keeps Save on the Personal checkout, since the copy goes to Personal', async () => {
    mocks.isTeamWorkspace = true;
    renderPublishedRoute(publishedClipyTemplate, {
      saveTemplate: vi.fn().mockResolvedValue({ kind: 'upgrade_required' }),
    });

    await mocks.viewProps?.onSaveTemplate();

    expect(mocks.startBillingCheckout).toHaveBeenCalledWith(true);
    expect(mocks.handleUpgradeRequiredForContext).not.toHaveBeenCalled();
  });
});
