import { describe, expect, it, vi } from 'vitest';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
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

describe('ChecklistLibrary route behavior', () => {
  it('navigates to the owner/template path when the owner username is known', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      slug: 'ultimate-camping-checklist',
      ownerProfile: { username: 'alice' },
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith(
      '/profile/alice/ultimate-camping-checklist',
    );
  });

  it('uses the official owner slug for repo-backed public templates', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      id: 'repo:starter-template',
      slug: 'starter-template',
      userId: REPO_TEMPLATE_USER_ID,
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith(
      `/profile/${REPO_TEMPLATE_OWNER_SLUG}/starter-template`,
    );
  });

  it('falls back to the public library when a template cannot produce a canonical owner URL', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      slug: 'missing-owner',
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('builds category filters as category detail routes', () => {
    expect(buildPublicCategoryPath('technical seo')).toBe(
      '/categories/technical-seo',
    );
  });
});
