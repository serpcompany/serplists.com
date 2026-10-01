import { describe, expect, it } from 'vitest';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  LEGACY_ACCOUNT_PATH,
  LEGACY_CONSOLE_PROFILE_PATH,
  buildCategorySlug,
  buildCanonicalPublicTemplatePath,
  buildConsoleArchivePath,
  buildConsoleHomePath,
  buildConsoleRunPath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicCategoriesPath,
  buildPublicCategoryPath,
  buildPublicFeaturePath,
  buildPublicProfilePath,
  buildProfilePreviewPath,
  getCanonicalProfilePath,
  buildPublicTemplatesPath,
  buildPublicTemplatePath,
  buildSharePath,
  findCategoryNameByLegacySlug,
  findCategoryNameBySlug,
  hasCanonicalPublicTemplatePath,
  isBlankTemplateEditorRoute,
  isPathWithin,
  resolveLegacyTemplatesCategoryRedirectPath,
  resolveConsoleSection,
  resolvePublicRouteTier,
  resolvePublicTemplateOwnerSlug,
  resolveRouteShell,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const baseTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Template',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
};

describe('routes', () => {
  it('builds the canonical public routes', () => {
    expect(buildPublicTemplatesPath()).toBe('/templates/');
    expect(buildPublicCategoriesPath()).toBe('/categories/');
    expect(buildPublicCategoryPath('Technical SEO')).toBe(
      '/categories/technical-seo/',
    );
    expect(buildPublicProfilePath('alice')).toBe('/profile/alice/');
    expect(buildPublicTemplatePath('alice', 'video-downloader')).toBe(
      '/profile/alice/video-downloader/',
    );
    expect(buildPublicFeaturePath('template-builder')).toBe(
      '/features/template-builder/',
    );
    expect(buildSharePath('share-123')).toBe('/share/share-123/');
  });

  it('gives a profile whose username looks like a file name a page URL', () => {
    expect(buildPublicProfilePath('john.doe')).toBe('/profile/john.doe/');
  });

  it("links the console home straight to the dashboard's home, since /dashboard/ only redirects there", () => {
    expect(buildConsoleHomePath()).toBe('/dashboard/templates/');
  });

  it('builds the canonical console routes', () => {
    expect(buildConsoleTemplatesPath()).toBe('/dashboard/templates/');
    expect(buildConsoleTemplateCreatePath()).toBe('/dashboard/templates/new/');
    expect(buildConsoleTemplateImportPath()).toBe('/dashboard/import-templates/');
    expect(buildConsoleTemplatePath('template-1')).toBe(
      '/dashboard/templates/template-1/',
    );
    expect(buildConsoleTemplateEditPath('template-1')).toBe(
      '/dashboard/templates/template-1/edit/',
    );
    expect(buildConsoleRunsPath()).toBe('/dashboard/runs/');
    expect(buildConsoleRunPath('run-1')).toBe('/dashboard/runs/run-1/');
    expect(buildConsoleSettingsPath()).toBe('/dashboard/settings/');
    expect(LEGACY_ACCOUNT_PATH).toBe('/account');
    expect(LEGACY_CONSOLE_PROFILE_PATH).toBe('/dashboard/profile');
  });

  it('flags template editor routes that should render on a blank workspace shell, with or without the trailing slash the router reports', () => {
    expect(isBlankTemplateEditorRoute('/dashboard/templates/new')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1/edit')).toBe(true);
    expect(isBlankTemplateEditorRoute('/console/templates/template-1/edit')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates')).toBe(false);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1')).toBe(false);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/new/')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1/edit/')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/')).toBe(false);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1/')).toBe(false);
  });

  it('builds and resolves category slugs', () => {
    expect(buildCategorySlug('Technical SEO')).toBe('technical-seo');
    expect(
      findCategoryNameBySlug(['Technical SEO', 'Content Ops'], 'technical-seo'),
    ).toBe('Technical SEO');
    expect(
      findCategoryNameBySlug(['Technical SEO', 'Content Ops'], 'missing'),
    ).toBeNull();
  });

  it('finds an accented category from the URL it had before its letters were folded', () => {
    const categories = ['Café Guides', 'Technical SEO'];

    expect(buildPublicCategoryPath('Café Guides')).toBe('/categories/cafe-guides/');
    expect(findCategoryNameBySlug(categories, 'caf-guides')).toBeNull();
    expect(findCategoryNameByLegacySlug(categories, 'caf-guides')).toBe('Café Guides');
    expect(findCategoryNameByLegacySlug(categories, 'missing')).toBeNull();
  });

  it('redirects legacy category-only template queries to canonical category routes', () => {
    expect(
      resolveLegacyTemplatesCategoryRedirectPath(
        new URLSearchParams('category=technical-seo'),
      ),
    ).toBe('/categories/technical-seo/');
    expect(
      resolveLegacyTemplatesCategoryRedirectPath(
        new URLSearchParams('category=Technical%20SEO'),
      ),
    ).toBe('/categories/technical-seo/');
    expect(
      resolveLegacyTemplatesCategoryRedirectPath(
        new URLSearchParams('category=technical-seo&sort=recent'),
      ),
    ).toBeNull();
    expect(
      resolveLegacyTemplatesCategoryRedirectPath(
        new URLSearchParams('search=seo'),
      ),
    ).toBeNull();
  });

  it('classifies routes into public and console shells, with or without the trailing slash the router reports', () => {
    expect(resolveRouteShell('/')).toBe('public');
    expect(resolveRouteShell('/templates')).toBe('public');
    expect(resolveRouteShell('/checklists')).toBe('public');
    expect(resolveRouteShell('/profile/alice')).toBe('public');
    expect(resolveRouteShell('/profile/alice/ultimate-camping-checklist')).toBe(
      'public',
    );
    expect(resolveRouteShell('/dashboard')).toBe('console');
    expect(resolveRouteShell('/dashboard/templates')).toBe('console');
    expect(resolveRouteShell('/dashboard/runs/run-1')).toBe('console');
    expect(resolveRouteShell('/console')).toBe('console');
    expect(resolveRouteShell('/account')).toBe('console');
    expect(resolveRouteShell('/templates/')).toBe('public');
    expect(resolveRouteShell('/profile/alice/ultimate-camping-checklist/')).toBe('public');
    expect(resolveRouteShell('/dashboard/templates/')).toBe('console');
    expect(resolveRouteShell('/dashboard/runs/run-1/')).toBe('console');
  });

  it('labels public routes by discovery emphasis, with or without the trailing slash the router reports', () => {
    expect(resolvePublicRouteTier('/')).toBe('marketing');
    expect(resolvePublicRouteTier('/templates')).toBe('core');
    expect(resolvePublicRouteTier('/checklists')).toBe('core');
    expect(resolvePublicRouteTier('/profile/alice')).toBe('core');
    expect(
      resolvePublicRouteTier('/profile/alice/ultimate-camping-checklist'),
    ).toBe('core');
    expect(resolvePublicRouteTier('/categories/outdoor')).toBe('secondary');
    expect(resolvePublicRouteTier('/features/template-builder')).toBe(
      'secondary',
    );
    expect(resolvePublicRouteTier('/share/share-123')).toBe('minimal');
    expect(resolvePublicRouteTier('/templates/')).toBe('core');
    expect(resolvePublicRouteTier('/profile/alice/')).toBe('core');
    expect(resolvePublicRouteTier('/categories/')).toBe('secondary');
    expect(resolvePublicRouteTier('/categories/outdoor/')).toBe('secondary');
    expect(resolvePublicRouteTier('/features/template-builder/')).toBe('secondary');
    expect(resolvePublicRouteTier('/share/share-123/')).toBe('minimal');
    expect(resolvePublicRouteTier('/pricing/')).toBe('marketing');
  });

  it('maps console routes to persistent navigation sections, with or without the trailing slash the router reports', () => {
    expect(resolveConsoleSection('/dashboard')).toBe('home');
    expect(resolveConsoleSection('/dashboard/templates')).toBe('templates');
    expect(resolveConsoleSection('/dashboard/templates/template-1')).toBe(
      'templates',
    );
    expect(resolveConsoleSection('/dashboard/import-templates')).toBe(
      'templates',
    );
    expect(resolveConsoleSection('/dashboard/runs')).toBe('runs');
    expect(resolveConsoleSection('/dashboard/runs/run-1')).toBe('runs');
    expect(resolveConsoleSection('/dashboard/settings')).toBe('account');
    expect(resolveConsoleSection('/dashboard/profile')).toBe('account');
    expect(buildConsoleArchivePath()).toBe('/dashboard/archive/');
    expect(resolveConsoleSection('/dashboard/archive')).toBe('archive');
    expect(resolveConsoleSection('/console')).toBe('home');
    expect(resolveConsoleSection('/account')).toBe('account');
    expect(resolveConsoleSection('/templates')).toBeNull();
    expect(resolveConsoleSection('/checklists')).toBeNull();
    expect(resolveConsoleSection('/dashboard/')).toBe('home');
    expect(resolveConsoleSection('/dashboard/templates/')).toBe('templates');
    expect(resolveConsoleSection('/dashboard/templates/template-1/edit/')).toBe('templates');
    expect(resolveConsoleSection('/dashboard/import-templates/')).toBe('templates');
    expect(resolveConsoleSection('/dashboard/runs/')).toBe('runs');
    expect(resolveConsoleSection('/dashboard/runs/run-1/')).toBe('runs');
    expect(resolveConsoleSection('/dashboard/settings/')).toBe('account');
    expect(resolveConsoleSection('/dashboard/archive/')).toBe('archive');
    expect(resolveConsoleSection('/templates/')).toBeNull();
  });

  it('resolves public owner slugs from template ownership data', () => {
    expect(
      resolvePublicTemplateOwnerSlug({
        ...baseTemplate,
        ownerProfile: { username: 'alice' },
      }),
    ).toBe('alice');

    expect(
      resolvePublicTemplateOwnerSlug({
        ...baseTemplate,
        userId: REPO_TEMPLATE_USER_ID,
      }),
    ).toBe(REPO_TEMPLATE_OWNER_SLUG);

    expect(
      resolvePublicTemplateOwnerSlug({
        ...baseTemplate,
        id: 'repo:starter-template',
        userId: 'unknown-owner',
      }),
    ).toBe(REPO_TEMPLATE_OWNER_SLUG);

    expect(resolvePublicTemplateOwnerSlug(baseTemplate)).toBeNull();
  });

  it('builds canonical public template paths from template records', () => {
    expect(
      buildCanonicalPublicTemplatePath({
        ...baseTemplate,
        slug: 'video-downloader',
        ownerProfile: { username: 'alice' },
      }),
    ).toBe('/profile/alice/video-downloader/');

    expect(
      buildCanonicalPublicTemplatePath({
        ...baseTemplate,
        slug: 'starter-template',
        userId: REPO_TEMPLATE_USER_ID,
      }),
    ).toBe(`/profile/${REPO_TEMPLATE_OWNER_SLUG}/starter-template/`);

    expect(
      buildCanonicalPublicTemplatePath({
        ...baseTemplate,
        slug: 'missing-owner',
      }),
    ).toBeNull();

    expect(
      buildCanonicalPublicTemplatePath({
        ...baseTemplate,
        ownerProfile: { username: 'alice' },
      }),
    ).toBe('/profile/alice/template-1/');
  });

  it('reports which templates have a public URL for discovery', () => {
    expect(hasCanonicalPublicTemplatePath({ ...baseTemplate, ownerProfile: { username: 'alice' } })).toBe(true);
    expect(hasCanonicalPublicTemplatePath({ ...baseTemplate, id: 'repo:starter' })).toBe(true);
    expect(hasCanonicalPublicTemplatePath({ ...baseTemplate, userId: REPO_TEMPLATE_USER_ID })).toBe(true);
    expect(hasCanonicalPublicTemplatePath({ ...baseTemplate, ownerProfile: { full_name: 'No Handle' } })).toBe(false);
    expect(hasCanonicalPublicTemplatePath({ ...baseTemplate, ownerProfile: { username: '  ' } })).toBe(false);
    expect(hasCanonicalPublicTemplatePath(baseTemplate)).toBe(false);
  });
});

describe('isPathWithin', () => {
  it('matches the page a link names and the pages under it in any form or case, and the home page only itself', () => {
    expect(isPathWithin('/dashboard/templates/abc/', buildConsoleTemplatesPath())).toBe(true);
    expect(isPathWithin('/dashboard/templates', buildConsoleTemplatesPath())).toBe(true);
    expect(isPathWithin('/Dashboard/Templates/', buildConsoleTemplatesPath())).toBe(true);
    expect(isPathWithin('/dashboard/runs/', buildConsoleTemplatesPath())).toBe(false);
    expect(isPathWithin('/', '/')).toBe(true);
    expect(isPathWithin('/about/', '/')).toBe(false);
  });
});

describe('getCanonicalProfilePath', () => {
  it('sends a mixed-case profile URL to the stored lowercase username', () => {
    expect(getCanonicalProfilePath('JohnDoe', 'johndoe')).toBe('/profile/johndoe/');
  });

  it('stays on a URL that already uses the stored username', () => {
    expect(getCanonicalProfilePath('johndoe', 'johndoe')).toBeNull();
  });

  it('treats a legacy mixed-case username as its own canonical form', () => {
    expect(getCanonicalProfilePath('MixedCase', 'MixedCase')).toBeNull();
  });

  it('does nothing without both usernames', () => {
    expect(getCanonicalProfilePath(undefined, 'johndoe')).toBeNull();
    expect(getCanonicalProfilePath('JohnDoe', null)).toBeNull();
  });
});

describe('buildProfilePreviewPath', () => {
  it('links the saved username as stored, even a legacy mixed-case one', () => {
    expect(buildProfilePreviewPath('JaneDoe', 'JaneDoe')).toBe('/profile/JaneDoe/');
    expect(buildProfilePreviewPath('  johndoe ', 'johndoe')).toBe('/profile/johndoe/');
  });

  it('previews the lowercase form an unsaved edit will be stored as', () => {
    expect(buildProfilePreviewPath('JANEDOE', 'JaneDoe')).toBe('/profile/janedoe/');
    expect(buildProfilePreviewPath('JohnDoe', 'john')).toBe('/profile/johndoe/');
    expect(buildProfilePreviewPath('JohnDoe', undefined)).toBe('/profile/johndoe/');
  });

  it('has no URL for an empty field', () => {
    expect(buildProfilePreviewPath('  ', 'JaneDoe')).toBeNull();
  });
});
