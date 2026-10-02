import { describe, expect, it, vi } from 'vitest';

import {
  loadTemplateDetailData,
  type LoadTemplateDetailResult,
} from '@/features/template-detail/useTemplateDetailModel';
import { createApiError } from '@/lib/api-errors';
import { repoTemplates } from '@/lib/repoTemplateCatalog';

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'template-1',
  title: 'Camping Checklist B',
  sections: [{ id: 'section-2', title: 'New section', items: [] }],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-04-18T00:00:00.000Z',
  updated_at: '2026-04-19T00:00:00.000Z',
  is_public: true,
  slug: 'camping-checklist',
  version: 4,
  ...overrides,
});

const loadedTemplate = (result: LoadTemplateDetailResult) =>
  result.kind === 'ok' ? result.template : null;

const buildApiClient = (getTemplateBySlug = vi.fn()) => ({
  clonePublicTemplate: vi.fn(),
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById: vi.fn(),
  getTemplateBySlug,
  updateTemplate: vi.fn(),
});

const libraryTemplate = repoTemplates[0];

describe('public template detail freshness', () => {
  it('loads a public template from the server every time', async () => {
    const apiClient = buildApiClient(vi.fn().mockResolvedValue(serverRow()));

    const result = await loadTemplateDetailData(
      { mode: 'public', identifier: 'camping-checklist', ownerUsername: 'Alice' },
      { apiClient },
    );

    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith('camping-checklist');
    expect(result.kind).toBe('ok');
    expect(loadedTemplate(result)?.title).toBe('Camping Checklist B');
    expect(loadedTemplate(result)?.sections[0]?.title).toBe('New section');
    expect(loadedTemplate(result)?.version).toBe(4);
  });

  it('shows not found once the server says the template is private', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockResolvedValue(serverRow({ is_public: false })),
    );

    const result = await loadTemplateDetailData(
      { mode: 'public', identifier: 'camping-checklist', ownerUsername: 'alice' },
      { apiClient },
    );

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('shows not found once the template is archived or its slug changed', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(createApiError(404, { error: 'Template not found' })),
    );

    const result = await loadTemplateDetailData(
      { mode: 'public', identifier: 'camping-checklist', ownerUsername: 'alice' },
      { apiClient },
    );

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('resolves a library template from the bundle, which the API cannot serve', async () => {
    const apiClient = buildApiClient();

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: libraryTemplate?.slug,
        ownerUsername: 'SERP',
      },
      { apiClient },
    );

    expect(result).toEqual({ kind: 'ok', template: libraryTemplate });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
  });

  it('asks the server for a template that shares a library slug under another owner', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockResolvedValue(serverRow({ slug: libraryTemplate?.slug })),
    );

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: libraryTemplate?.slug,
        ownerUsername: 'alice',
      },
      { apiClient },
    );

    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith(libraryTemplate?.slug);
    expect(loadedTemplate(result)?.id).toBe('template-1');
  });
});

describe('private template detail freshness', () => {
  it('resolves a library template from the bundle without a request', async () => {
    const apiClient = buildApiClient();

    const result = await loadTemplateDetailData(
      {
        mode: 'private',
        identifier: libraryTemplate?.id,
      },
      { apiClient },
    );

    expect(result).toEqual({ kind: 'ok', template: libraryTemplate });
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
  });
});
