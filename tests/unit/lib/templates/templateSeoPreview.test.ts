import { describe, expect, it } from 'vitest';

import { generateSlug as serverGenerateSlug } from '../../../../functions/api/utils/slug';
import { buildCanonicalPublicTemplatePath, buildPublicTemplatePath } from '@/lib/routes';
import {
  buildTemplateSeoPreview,
  resolveTemplateEditorOwnerSlug,
  resolveTemplatePreviewSlug,
  TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN,
} from '@/lib/templates/templateSeoPreview';
import { generateSlug } from '@/utils/urlHelpers';

const ORIGIN = 'https://serplists.com';

// The editor's Search & SEO preview showed example.com/templates/<slug> (a route the app
// does not have) and "untitled" for a blank slug. Public templates are served at
// /profile/<owner username>/<slug>, with the slug the server stores.
describe('buildTemplateSeoPreview', () => {
  it('previews the public template route, not /templates/', () => {
    const preview = buildTemplateSeoPreview({
      seoUrl: 'launch-checklist',
      title: 'Launch',
      ownerSlug: 'jane',
      origin: ORIGIN,
    });

    expect(preview).toMatchObject({
      kind: 'url',
      slug: 'launch-checklist',
      url: 'https://serplists.com/profile/jane/launch-checklist/',
    });
    if (preview.kind === 'url') {
      expect(preview.url).not.toContain('/templates/');
      expect(preview.url).not.toContain('example.com');
    }
  });

  it('shows the slug the save sends for messy input', () => {
    expect(
      resolveTemplatePreviewSlug({ seoUrl: '  Launch Checklist! ', title: '' }),
    ).toBe('launch-checklist');
  });

  it('builds a new template slug from its name, as the server does', () => {
    expect(resolveTemplatePreviewSlug({ seoUrl: '', title: 'Launch Checklist!' })).toBe(
      'launch-checklist',
    );
    // A symbols-only slug cannot be saved, so the preview shows the slug from the name.
    expect(resolveTemplatePreviewSlug({ seoUrl: '!!!', title: 'Launch Checklist' })).toBe(
      'launch-checklist',
    );
  });

  it('uses the saved default name when a new template has no name', () => {
    // A blank name is saved as "Untitled Template".
    expect(resolveTemplatePreviewSlug({ seoUrl: '', title: '   ' })).toBe('untitled-template');
  });

  it('falls back to "template" when the name has no usable characters', () => {
    expect(resolveTemplatePreviewSlug({ seoUrl: '', title: '日本語' })).toBe('template');
  });

  it('keeps the stored slug of an existing template when the field is cleared', () => {
    // The API keeps the slug when none is sent; it never becomes "untitled".
    expect(
      resolveTemplatePreviewSlug({ seoUrl: '', storedSlug: 'old-slug', title: 'New name' }),
    ).toBe('old-slug');
    expect(
      resolveTemplatePreviewSlug({ seoUrl: '   ', storedSlug: 'old-slug', title: 'New name' }),
    ).toBe('old-slug');
  });

  it('keeps an unchanged stored slug even if it predates the slug rules', () => {
    expect(
      resolveTemplatePreviewSlug({ seoUrl: 'Legacy_Slug', storedSlug: 'Legacy_Slug', title: '' }),
    ).toBe('Legacy_Slug');
  });

  it('matches the canonical public path for a saved template', () => {
    const preview = buildTemplateSeoPreview({
      seoUrl: 'launch-checklist',
      storedSlug: 'launch-checklist',
      title: 'Launch',
      ownerSlug: 'jane',
      origin: ORIGIN,
    });

    expect(preview.kind === 'url' ? new URL(preview.url).pathname : null).toBe(
      buildCanonicalPublicTemplatePath({
        id: 'template-1',
        slug: 'launch-checklist',
        userId: 'user-1',
        ownerProfile: { username: 'jane' },
      }),
    );
  });

  it('encodes the owner and slug like the real route', () => {
    const preview = buildTemplateSeoPreview({
      seoUrl: 'Legacy Slug',
      storedSlug: 'Legacy Slug',
      title: '',
      ownerSlug: 'jane doe',
      origin: ORIGIN,
    });

    expect(preview.kind === 'url' ? preview.url : null).toBe(
      new URL(buildPublicTemplatePath('jane doe', 'Legacy Slug'), ORIGIN).toString(),
    );
  });

  it('says a username is needed instead of making up a path', () => {
    const preview = buildTemplateSeoPreview({
      seoUrl: 'launch-checklist',
      title: '',
      ownerSlug: null,
      origin: ORIGIN,
    });

    expect(preview).toEqual({ kind: 'needs-username', slug: 'launch-checklist' });
  });

  it('notes a possible suffix only when the save sends a slug', () => {
    const base = { title: 'Launch', ownerSlug: 'jane', origin: ORIGIN };

    expect(buildTemplateSeoPreview({ ...base, seoUrl: 'launch' }).mayGetSuffix).toBe(true);
    expect(buildTemplateSeoPreview({ ...base, seoUrl: '' }).mayGetSuffix).toBe(true);
    expect(
      buildTemplateSeoPreview({ ...base, seoUrl: 'renamed', storedSlug: 'launch' }).mayGetSuffix,
    ).toBe(true);
    expect(
      buildTemplateSeoPreview({ ...base, seoUrl: 'launch', storedSlug: 'launch' }).mayGetSuffix,
    ).toBe(false);
    expect(
      buildTemplateSeoPreview({ ...base, seoUrl: '', storedSlug: 'launch' }).mayGetSuffix,
    ).toBe(false);
  });

  it('uses serplists.com when no origin is given', () => {
    const preview = buildTemplateSeoPreview({ seoUrl: 'a', title: '', ownerSlug: 'jane' });

    expect(preview.kind === 'url' ? preview.url : null).toBe(
      `${TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN}/profile/jane/a/`,
    );
  });
});

// The preview builds a new template's slug with the client generateSlug; it must match
// the one the API uses, or the preview drifts from what is stored.
describe('client and server generateSlug', () => {
  it.each([
    'Launch Checklist',
    'Launch Checklist!',
    '  Too   Many   Spaces  ',
    '---Multiple-Hyphens---',
    'Home & Garden Tasks',
    "Tom's list",
    'Café au lait',
    'snake_case_title',
    '2024 Tax Preparation!',
    '',
    '日本語',
  ])('agree on %j', (input) => {
    expect(generateSlug(input)).toBe(serverGenerateSlug(input));
  });
});

describe('resolveTemplateEditorOwnerSlug', () => {
  it('uses the signed-in user for a new template', () => {
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: true, loadedOwnerSlug: 'other', viewerUsername: ' jane ' }),
    ).toBe('jane');
    expect(resolveTemplateEditorOwnerSlug({ isNew: true, viewerUsername: '' })).toBeNull();
    expect(resolveTemplateEditorOwnerSlug({ isNew: true })).toBeNull();
  });

  it("uses a loaded template's creator, not the person editing it", () => {
    // An Organization member editing a teammate's template sees the teammate's URL.
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: false, loadedOwnerSlug: 'teammate', viewerUsername: 'jane' }),
    ).toBe('teammate');
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: false, loadedOwnerSlug: null, viewerUsername: 'jane' }),
    ).toBeNull();
  });
});
