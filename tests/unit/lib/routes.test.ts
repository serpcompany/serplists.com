import { describe, expect, it } from 'vitest';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildCategorySlug,
  buildCanonicalPublicTemplatePath,
  buildConsoleHomePath,
  buildConsoleRunPath,
  buildConsoleRunsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicCategoriesPath,
  buildPublicCategoryPath,
  buildPublicFeaturePath,
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  buildPublicTemplatePath,
  buildSharePath,
  findCategoryNameBySlug,
  isBlankTemplateEditorRoute,
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
    expect(buildPublicTemplatesPath()).toBe('/checklists');
    expect(buildPublicCategoriesPath()).toBe('/categories');
    expect(buildPublicCategoryPath('Technical SEO')).toBe(
      '/categories/technical-seo',
    );
    expect(buildPublicProfilePath('alice')).toBe('/profile/alice');
    expect(buildPublicTemplatePath('alice', 'video-downloader')).toBe(
      '/profile/alice/video-downloader',
    );
    expect(buildPublicFeaturePath('template-builder')).toBe(
      '/features/template-builder',
    );
    expect(buildSharePath('share-123')).toBe('/share/share-123');
  });

  it('builds the canonical console routes', () => {
    expect(buildConsoleHomePath()).toBe('/dashboard');
    expect(buildConsoleTemplatesPath()).toBe('/dashboard/templates');
    expect(buildConsoleTemplateCreatePath()).toBe('/dashboard/templates/new');
    expect(buildConsoleTemplatePath('template-1')).toBe(
      '/dashboard/templates/template-1',
    );
    expect(buildConsoleTemplateEditPath('template-1')).toBe(
      '/dashboard/templates/template-1/edit',
    );
    expect(buildConsoleRunsPath()).toBe('/dashboard/runs');
    expect(buildConsoleRunPath('run-1')).toBe('/dashboard/runs/run-1');
  });

  it('flags template editor routes that should render on a blank workspace shell', () => {
    expect(isBlankTemplateEditorRoute('/dashboard/templates/new')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1/edit')).toBe(true);
    expect(isBlankTemplateEditorRoute('/console/templates/template-1/edit')).toBe(true);
    expect(isBlankTemplateEditorRoute('/dashboard/templates')).toBe(false);
    expect(isBlankTemplateEditorRoute('/dashboard/templates/template-1')).toBe(false);
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

  it('classifies routes into public and console shells', () => {
    expect(resolveRouteShell('/')).toBe('public');
    expect(resolveRouteShell('/checklists')).toBe('public');
    expect(resolveRouteShell('/templates')).toBe('public');
    expect(resolveRouteShell('/profile/alice')).toBe('public');
    expect(resolveRouteShell('/profile/alice/ultimate-camping-checklist')).toBe(
      'public',
    );
    expect(resolveRouteShell('/dashboard')).toBe('console');
    expect(resolveRouteShell('/dashboard/templates')).toBe('console');
    expect(resolveRouteShell('/dashboard/runs/run-1')).toBe('console');
    expect(resolveRouteShell('/console')).toBe('console');
    expect(resolveRouteShell('/account')).toBe('console');
  });

  it('labels public routes by discovery emphasis', () => {
    expect(resolvePublicRouteTier('/')).toBe('marketing');
    expect(resolvePublicRouteTier('/checklists')).toBe('core');
    expect(resolvePublicRouteTier('/templates')).toBe('core');
    expect(resolvePublicRouteTier('/profile/alice')).toBe('core');
    expect(
      resolvePublicRouteTier('/profile/alice/ultimate-camping-checklist'),
    ).toBe('core');
    expect(resolvePublicRouteTier('/categories/outdoor')).toBe('secondary');
    expect(resolvePublicRouteTier('/features/template-builder')).toBe(
      'secondary',
    );
    expect(resolvePublicRouteTier('/share/share-123')).toBe('minimal');
  });

  it('maps console routes to persistent navigation sections', () => {
    expect(resolveConsoleSection('/dashboard')).toBe('home');
    expect(resolveConsoleSection('/dashboard/templates')).toBe('templates');
    expect(resolveConsoleSection('/dashboard/templates/template-1')).toBe(
      'templates',
    );
    expect(resolveConsoleSection('/dashboard/runs')).toBe('runs');
    expect(resolveConsoleSection('/dashboard/runs/run-1')).toBe('runs');
    expect(resolveConsoleSection('/console')).toBe('home');
    expect(resolveConsoleSection('/account')).toBe('account');
    expect(resolveConsoleSection('/checklists')).toBeNull();
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
    ).toBe('/profile/alice/video-downloader');

    expect(
      buildCanonicalPublicTemplatePath({
        ...baseTemplate,
        slug: 'starter-template',
        userId: REPO_TEMPLATE_USER_ID,
      }),
    ).toBe(`/profile/${REPO_TEMPLATE_OWNER_SLUG}/starter-template`);

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
    ).toBe('/profile/alice/template-1');
  });
});
