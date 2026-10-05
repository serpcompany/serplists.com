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

describe('buildTemplateSeoPreview, which previews the public template URL with the slug the server stores', () => {
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
  });

  it('previews the slug from the name for a symbols-only slug, which cannot be saved', () => {
    expect(resolveTemplatePreviewSlug({ seoUrl: '!!!', title: 'Launch Checklist' })).toBe(
      'launch-checklist',
    );
  });

  it('uses the default name a blank name is saved as, "Untitled Template", when a new template has no name', () => {
    expect(resolveTemplatePreviewSlug({ seoUrl: '', title: '   ' })).toBe('untitled-template');
  });

  it('falls back to "template" when the name has no usable characters', () => {
    expect(resolveTemplatePreviewSlug({ seoUrl: '', title: '日本語' })).toBe('template');
  });

  it('keeps the stored slug of an existing template when the field is cleared, as the API does when no slug is sent', () => {
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

    expect(buildTemplateSeoPreview({ ...base, seoUrl: 'launch' })).toMatchObject({ mayGetSuffix: true });
    expect(buildTemplateSeoPreview({ ...base, seoUrl: '' })).toMatchObject({ mayGetSuffix: true });
    expect(buildTemplateSeoPreview({ ...base, seoUrl: 'renamed', storedSlug: 'launch' })).toMatchObject({
      mayGetSuffix: true,
    });
    expect(buildTemplateSeoPreview({ ...base, seoUrl: 'launch', storedSlug: 'launch' })).toMatchObject({
      mayGetSuffix: false,
    });
    expect(buildTemplateSeoPreview({ ...base, seoUrl: '', storedSlug: 'launch' })).toMatchObject({
      mayGetSuffix: false,
    });
  });

  it('uses serplists.com when no origin is given', () => {
    const preview = buildTemplateSeoPreview({ seoUrl: 'a', title: '', ownerSlug: 'jane' });

    expect(preview.kind === 'url' ? preview.url : null).toBe(
      `${TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN}/profile/jane/a/`,
    );
  });
});

describe("client and server generateSlug, which must agree so a new template's preview shows the slug it is stored with", () => {
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
  it("uses the handle a new template is created under: the signed-in user's, or the active Organization's", () => {
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: true, loadedOwnerSlug: 'other', newTemplateOwnerHandle: ' jane ' }),
    ).toBe('jane');
    expect(resolveTemplateEditorOwnerSlug({ isNew: true, newTemplateOwnerHandle: 'Acme-Launch' })).toBe('Acme-Launch');
    expect(resolveTemplateEditorOwnerSlug({ isNew: true, newTemplateOwnerHandle: '' })).toBeNull();
    expect(resolveTemplateEditorOwnerSlug({ isNew: true })).toBeNull();
  });

  it("uses a loaded template's Template Owner, not the person editing it, so a member editing an Organization's template sees the Organization's URL", () => {
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: false, loadedOwnerSlug: 'Acme-Launch', newTemplateOwnerHandle: 'jane' }),
    ).toBe('Acme-Launch');
    expect(
      resolveTemplateEditorOwnerSlug({ isNew: false, loadedOwnerSlug: null, newTemplateOwnerHandle: 'jane' }),
    ).toBeNull();
  });
});
