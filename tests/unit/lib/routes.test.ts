import { describe, expect, it } from 'vitest';

import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
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
  buildOrganizationProfilePath,
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
  hasCanonicalPublicTemplatePath,
  isBlankTemplateEditorRoute,
  isPathWithin,
  resolveLegacyTemplatesCategoryRedirectPath,
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
    expect(buildConsoleHomePath(PERSONAL_CONSOLE)).toBe('/dashboard/templates/');
  });

  it('builds the canonical console routes', () => {
    expect(buildConsoleTemplatesPath(PERSONAL_CONSOLE)).toBe('/dashboard/templates/');
    expect(buildConsoleTemplateCreatePath(PERSONAL_CONSOLE)).toBe('/dashboard/templates/new/');
    expect(buildConsoleTemplateImportPath(PERSONAL_CONSOLE)).toBe('/dashboard/import-templates/');
    expect(buildConsoleTemplatePath('template-1', PERSONAL_CONSOLE)).toBe(
      '/dashboard/templates/template-1/',
    );
    expect(buildConsoleTemplateEditPath('template-1', PERSONAL_CONSOLE)).toBe(
      '/dashboard/templates/template-1/edit/',
    );
    expect(buildConsoleRunsPath(PERSONAL_CONSOLE)).toBe('/dashboard/runs/');
    expect(buildConsoleRunPath('run-1', PERSONAL_CONSOLE)).toBe('/dashboard/runs/run-1/');
    expect(buildConsoleSettingsPath(PERSONAL_CONSOLE)).toBe('/dashboard/settings/');
    expect(buildConsoleArchivePath(PERSONAL_CONSOLE)).toBe('/dashboard/archive/');
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

  it('builds category slugs', () => {
    expect(buildCategorySlug('Technical SEO')).toBe('technical-seo');
  });

  it('finds an accented category from the URL it had before its letters were folded', () => {
    const categories = ['Café Guides', 'Technical SEO'];

    expect(buildPublicCategoryPath('Café Guides')).toBe('/categories/cafe-guides/');
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

  it("resolves an Organization Template to its Organization's handle, and never falls back to its Creator", () => {
    const createdByAlice = { ...baseTemplate, ownerProfile: { username: 'alice' }, ownerType: 'team' as const, teamId: 'org-1' };

    expect(
      resolvePublicTemplateOwnerSlug({ ...createdByAlice, owner: { type: 'team', publicHandle: ' Acme-Launch ', displayName: 'Acme' } }),
    ).toBe('Acme-Launch');
    expect(buildCanonicalPublicTemplatePath({ ...createdByAlice, slug: 'launch', owner: { type: 'team', publicHandle: 'Acme-Launch', displayName: null } })).toBe(
      '/profile/Acme-Launch/launch/',
    );
    expect(resolvePublicTemplateOwnerSlug({ ...createdByAlice, owner: { type: 'team' } })).toBeNull();
    expect(resolvePublicTemplateOwnerSlug({ ...createdByAlice, owner: { type: 'team', teamId: 'org-1', publicHandle: null, displayName: null } })).toBeNull();
    expect(resolvePublicTemplateOwnerSlug(createdByAlice)).toBeNull();
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
    expect(isPathWithin('/dashboard/templates/abc/', buildConsoleTemplatesPath(PERSONAL_CONSOLE))).toBe(true);
    expect(isPathWithin('/dashboard/templates', buildConsoleTemplatesPath(PERSONAL_CONSOLE))).toBe(true);
    expect(isPathWithin('/Dashboard/Templates/', buildConsoleTemplatesPath(PERSONAL_CONSOLE))).toBe(true);
    expect(isPathWithin('/dashboard/runs/', buildConsoleTemplatesPath(PERSONAL_CONSOLE))).toBe(false);
    expect(isPathWithin('/', '/')).toBe(true);
    expect(isPathWithin('/about/', '/')).toBe(false);
  });
});

describe('buildOrganizationProfilePath', () => {
  it("links an Organization's public profile at its handle", () => {
    expect(buildOrganizationProfilePath({ type: 'team', slug: 'acme-launch' })).toBe('/profile/acme-launch/');
    expect(buildOrganizationProfilePath({ type: 'team', slug: ' Acme.Launch ' })).toBe('/profile/Acme.Launch/');
  });

  it('has no profile to link for Personal or for an Organization without a handle', () => {
    expect(buildOrganizationProfilePath({ type: 'personal', slug: 'alice' })).toBeNull();
    expect(buildOrganizationProfilePath({ type: 'team' })).toBeNull();
    expect(buildOrganizationProfilePath({ type: 'team', slug: null })).toBeNull();
    expect(buildOrganizationProfilePath({ type: 'team', slug: '  ' })).toBeNull();
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
