import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  installNavigationWindow,
  publishedClipyTemplate,
  renderPublishedRoute,
  restoreNavigationWindow,
  robotsTagThePageAdds,
} from '../../support/publicTemplatePage';
import {
  findPublicTemplateByIdentifier,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import { SITE_ORIGIN } from '@/lib/routes';
import { CANONICAL_ORIGIN } from '../../../functions/sitemap/shared';
import type { ChecklistTemplate } from '@/types/checklist';

beforeAll(installNavigationWindow);
afterAll(restoreNavigationWindow);

const templateOfAlice = (fields: Partial<ChecklistTemplate>): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Template',
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
  ...fields,
});

const statValue = (html: string, label: string) => html.match(new RegExp(`>([^<]*)</p><p class="[^"]*">${label}</p>`))?.[1];

const { ownerProfile: _noOwnerProfile, ...bundledTemplate } = templateOfAlice({
  id: 'repo:ultimate-camping-checklist',
  slug: 'ultimate-camping-checklist',
  title: 'Ultimate Camping Checklist',
  userId: REPO_TEMPLATE_USER_ID,
});

const mockTemplates: ChecklistTemplate[] = [
  templateOfAlice({ id: 'template-1', slug: 'camping-checklist', title: 'Camping Checklist' }),
  templateOfAlice({ id: 'legacy-template', title: 'Legacy Template' }),
  bundledTemplate,
  templateOfAlice({
    id: 'template-4',
    slug: 'private-checklist',
    title: 'Private Template',
    isPublic: false,
    userId: 'user-4',
  }),
];

const resolveTemplateForRoute = (username: string, templateSlug: string) =>
  findPublicTemplateByIdentifier(mockTemplates, templateSlug, username);

describe('PublicTemplate route lookup in the bundled library (findPublicTemplateByIdentifier)', () => {
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

  it('counts every task in every section in its Tasks stat', () => {
    const template = templateOfAlice({
      slug: 'three-tasks',
      title: 'Three tasks',
      sections: [
        { id: 'before', title: 'Before', items: [{ id: 'pack', title: 'Pack' }, { id: 'charge', title: 'Charge' }] },
        { id: 'after', title: 'After', items: [{ id: 'unpack', title: 'Unpack' }] },
      ],
    });

    expect(statValue(renderPublishedRoute(template).html, 'Tasks')).toBe('3');
    expect(statValue(renderPublishedRoute(publishedClipyTemplate).html, 'Tasks')).toBe('1');
  });

  it('adds no robots rule of its own to a template that loaded, on any host', () => {
    expect(robotsTagThePageAdds(renderPublishedRoute(publishedClipyTemplate).html)).toBeUndefined();
    const staging = renderPublishedRoute(publishedClipyTemplate, {}, {
      path: '/profile/Alice/reviewed-clipy-checklist',
      origin: 'https://staging.serplists.com',
      search: '?ref=x',
    });
    expect(robotsTagThePageAdds(staging.html)).toBeUndefined();
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

    expect(robotsTagThePageAdds(html)).toBe('noindex, nofollow');
  });

  it('keeps a template that failed to load indexable, since the failure may be temporary', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      loadError: 'HTTP 503',
      reload: vi.fn(),
      template: null,
    });

    expect(robotsTagThePageAdds(html)).toBeUndefined();
    expect(html).not.toContain('noindex');
  });

  it('keeps a template that loaded indexable', () => {
    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).not.toContain('noindex');
  });
});

describe('PublicTemplate canonical URL, which the server names on the production site', () => {
  it('shares its origin with the sitemap', () => {
    expect(SITE_ORIGIN).toBe(CANONICAL_ORIGIN);
  });
});
