import { describe, expect, it } from 'vitest';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

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
