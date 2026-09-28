import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import PublicTemplate from '@/pages/PublicTemplate';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import { SITE_ORIGIN, resolvePublicTemplateOwnerSlug } from '@/lib/routes';

import { CANONICAL_ORIGIN } from '../../../functions/sitemap/shared';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateDetailModel = vi.fn();

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: unknown[]) => mockUseTemplateDetailModel(...args),
}));

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

function renderPublishedRoute(template: ChecklistTemplate, visit: RouteVisit = CLEAN_VISIT) {
  mockUseTemplateDetailModel.mockReturnValue({
    billingState: { billingEnabled: true, isLoading: false, isPro: false },
    loading: false,
    notFound: false,
    saveTemplate: vi.fn(),
    startRun: vi.fn(),
    template,
    totalItems: 0,
  });
  const search = visit.search ?? '';
  const hash = visit.hash ?? '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: `${visit.origin}${visit.path}${search}${hash}`,
        origin: visit.origin,
        pathname: visit.path,
        search,
        hash,
      },
    },
  });
  const helmetContext: Record<string, unknown> = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={`${visit.path}${search}${hash}`}>
        <Routes>
          <Route path="/profile/:username/:templateSlug" element={<PublicTemplate />} />
        </Routes>
      </StaticRouter>
    </HelmetProvider>,
  );

  return {
    helmet: helmetContext.helmet as {
      link: { toString(): string };
      meta: { toString(): string };
      script: { toString(): string };
      title: { toString(): string };
    },
    html,
  };
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

describe('PublicTemplate canonical URL', () => {
  const expectCanonical = (
    helmet: ReturnType<typeof renderPublishedRoute>['helmet'],
    expected: string,
  ) => {
    expect(helmet.link.toString()).toContain(`rel="canonical" href="${expected}"`);
    expect(helmet.meta.toString()).toContain(`property="og:url" content="${expected}"`);
    expect(helmet.script.toString()).toContain(`"url":"${expected}"`);
    for (const output of [helmet.link, helmet.meta, helmet.script]) {
      expect(output.toString()).not.toMatch(/utm_source=twitter|fbclid|#frag/);
    }
  };

  it('ignores tracking parameters, the hash and the owner casing of the visited URL', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate, {
      path: '/profile/ALICE/reviewed-clipy-checklist',
      origin: 'https://serplists.com',
      search: '?utm_source=twitter',
      hash: '#frag',
    });

    expectCanonical(helmet, 'https://serplists.com/profile/alice/reviewed-clipy-checklist');
  });

  it('points a visit by template id at the slug URL', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate, {
      path: '/profile/alice/clipy-template-1',
      origin: 'https://serplists.com',
      search: '?fbclid=1',
    });

    expectCanonical(helmet, 'https://serplists.com/profile/alice/reviewed-clipy-checklist');
  });

  it('names the production site on staging and preview hosts, as the sitemap does', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate, {
      path: '/profile/alice/reviewed-clipy-checklist',
      origin: 'https://staging.serplists.pages.dev',
    });

    expectCanonical(helmet, `${CANONICAL_ORIGIN}/profile/alice/reviewed-clipy-checklist`);
  });

  it('uses the template id for a template without a slug', () => {
    const { helmet } = renderPublishedRoute({ ...publishedClipyTemplate, slug: undefined });

    expectCanonical(helmet, 'https://serplists.com/profile/alice/clipy-template-1');
  });

  it('uses the official owner for repo templates', () => {
    const { helmet } = renderPublishedRoute(
      {
        ...publishedClipyTemplate,
        id: 'repo:ultimate-camping-checklist',
        slug: 'ultimate-camping-checklist',
        userId: REPO_TEMPLATE_USER_ID,
        ownerProfile: undefined,
      },
      {
        path: `/profile/${REPO_TEMPLATE_OWNER_SLUG}/ultimate-camping-checklist`,
        origin: 'https://serplists.com',
      },
    );

    expectCanonical(
      helmet,
      `https://serplists.com/profile/${REPO_TEMPLATE_OWNER_SLUG}/ultimate-camping-checklist`,
    );
  });

  it('shares its origin with the sitemap', () => {
    expect(SITE_ORIGIN).toBe(CANONICAL_ORIGIN);
  });
});

// Pages answers every path with index.html and a 200, so a missing template must mark itself
// noindex. A failed lookup may be transient, so it must not: it offers a retry instead.
function renderLookupState(state: { loadError: boolean; notFound: boolean }) {
  mockUseTemplateDetailModel.mockReturnValue({
    billingState: { billingEnabled: true, isLoading: false, isPro: false },
    loading: false,
    retry: vi.fn(),
    saveTemplate: vi.fn(),
    startRun: vi.fn(),
    template: null,
    totalItems: 0,
    ...state,
  });
  const helmetContext: Record<string, unknown> = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location="/profile/alice/deleted-checklist">
        <Routes>
          <Route path="/profile/:username/:templateSlug" element={<PublicTemplate />} />
        </Routes>
      </StaticRouter>
    </HelmetProvider>,
  );
  const helmet = helmetContext.helmet as {
    link: { toString(): string };
    meta: { toString(): string };
    script: { toString(): string };
    title: { toString(): string };
  };
  return { helmet, html };
}

describe('PublicTemplate lookup failures', () => {
  it('marks a settled missing template noindex, with no canonical URL', () => {
    const { helmet, html } = renderLookupState({ loadError: false, notFound: true });

    expect(html).toContain('Template not found');
    expect(helmet.meta.toString()).toMatch(/name="robots" content="noindex, follow"/);
    expect(helmet.title.toString()).toContain('>Template not found | SERP Lists</title>');
    expect(helmet.link.toString()).not.toContain('canonical');
    expect(helmet.meta.toString()).not.toContain('og:url');
    expect(helmet.script.toString()).not.toContain('ld+json');
  });

  it('offers a retry and stays indexable when the lookup failed', () => {
    const { helmet, html } = renderLookupState({ loadError: true, notFound: false });

    expect(html).toContain('Could not load this template');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Template not found');
    expect(helmet.meta.toString()).not.toContain('noindex');
  });

  it('leaves a found template indexable', () => {
    const { helmet } = renderPublishedRoute(publishedClipyTemplate);

    expect(helmet.meta.toString()).not.toContain('noindex');
  });
});
