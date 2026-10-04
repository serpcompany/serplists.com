import '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TemplateVisibilityMeta } from '@/components/template/TemplateVisibilityMeta';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

type MetaTemplate = Pick<ChecklistTemplate, 'id' | 'isPublic' | 'ownerProfile' | 'slug' | 'userId'>;

const template: MetaTemplate = {
  id: 'tpl-1',
  isPublic: true,
  ownerProfile: { username: 'alice' },
  slug: 'launch-checklist',
  userId: 'user-a',
};

const render = (overrides: Partial<MetaTemplate>) =>
  renderToStaticMarkup(<TemplateVisibilityMeta template={{ ...template, ...overrides }} />);

describe("the Template page's visibility", () => {
  it('links a public Template to its live public page, by the same route as Share', () => {
    const html = render({});

    expect(html).toContain('>Public<');
    expect(html).toMatch(/<a[^>]*href="\/profile\/alice\/launch-checklist\/"[^>]*>View public template<\/a>/);
  });

  it("links an Organization's public Template to the URL that serves it today, its creator's", () => {
    expect(render({ ownerProfile: { username: 'org-creator' } })).toContain('href="/profile/org-creator/launch-checklist/"');
  });

  it('falls back to the id when a public Template has no slug, and links a bundled Template under its catalog owner', () => {
    expect(render({ slug: '' })).toContain('href="/profile/alice/tpl-1/"');
    expect(render({ ownerProfile: {}, userId: REPO_TEMPLATE_USER_ID })).toContain('View public template');
  });

  it('says the public page is unavailable, rather than guessing a link, when its creator has no username', () => {
    const html = render({ ownerProfile: {} });

    expect(html).toContain('Public page unavailable until its creator sets a username');
    expect(html).not.toContain('<a');
  });

  it('shows a private Template as Private, with no public page action', () => {
    const html = render({ isPublic: false });

    expect(html).toContain('>Private<');
    expect(html).not.toContain('View public template');
    expect(html).not.toContain('unavailable');
  });
});
