import { describe, expect, it, vi } from 'vitest';

import { loadTemplateDetailData } from '@/features/template-detail/useTemplateDetailModel';
import { createApiError } from '@/lib/api-errors';

import { templateDetailApiClient } from '../../../fixtures/templateDetailApiClient';

const TEMPLATE_UUID = '4f7c1a52-9b1e-4c1d-8a61-2f8e5b3c9d10';

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: TEMPLATE_UUID,
  title: 'Camping Checklist',
  sections: [],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-04-18T00:00:00.000Z',
  is_public: true,
  slug: 'camping-checklist',
  version: 2,
  ...overrides,
});

const buildApiClient = templateDetailApiClient;

const privateOptions = (identifier: string) => ({
  identifier,
  mode: 'private' as const,
});

const publicOptions = (identifier: string) => ({
  identifier,
  mode: 'public' as const,
  ownerUsername: 'alice',
});

describe('private template detail load failures', () => {
  it('reports a server error for a template id without a second lookup', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(createApiError(503, { error: 'Service unavailable' })),
    });

    const result = await loadTemplateDetailData(privateOptions(TEMPLATE_UUID), { apiClient });

    expect(result).toEqual({ kind: 'error', message: 'Service unavailable' });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

  it('reports a network failure as an error, not as a missing template', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    const result = await loadTemplateDetailData(privateOptions('template-1'), { apiClient });

    expect(result.kind).toBe('error');
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

  it('treats a 404 for a template id as final, since no slug looks like an id', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(createApiError(404, { error: 'Template not found' })),
    });

    const result = await loadTemplateDetailData(privateOptions(TEMPLATE_UUID), { apiClient });

    expect(result).toEqual({ kind: 'not_found' });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

  it('falls back to the slug lookup only after a 404 for another identifier, and keeps the id that the page links Edit to', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(createApiError(404, { error: 'Template not found' })),
      getTemplateBySlug: vi.fn().mockResolvedValue(serverRow()),
    });

    const result = await loadTemplateDetailData(privateOptions('camping-checklist'), { apiClient });

    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith('camping-checklist');
    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' ? result.template.title : null).toBe('Camping Checklist');
    expect(result.kind === 'ok' ? result.template.id : null).toBe(TEMPLATE_UUID);
  });

  it('classifies a failing slug lookup by its status too', async () => {
    const notFound = await loadTemplateDetailData(privateOptions('camping-checklist'), {
      apiClient: buildApiClient({
        getTemplateById: vi.fn().mockRejectedValue(createApiError(404)),
        getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(404)),
      }),
    });
    const failed = await loadTemplateDetailData(privateOptions('camping-checklist'), {
      apiClient: buildApiClient({
        getTemplateById: vi.fn().mockRejectedValue(createApiError(404)),
        getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(500)),
      }),
    });

    expect(notFound).toEqual({ kind: 'not_found' });
    expect(failed.kind).toBe('error');
  });

  it('still loads the template when the owner profile lookup fails', async () => {
    const apiClient = buildApiClient({
      getProfileById: vi.fn().mockRejectedValue(createApiError(500)),
      getTemplateById: vi.fn().mockResolvedValue(serverRow({ owner_username: undefined })),
    });

    const result = await loadTemplateDetailData(privateOptions(TEMPLATE_UUID), { apiClient });

    expect(result.kind).toBe('ok');
  });
});

describe('public template detail load failures', () => {
  it('reports a server error instead of saying the template is not public', async () => {
    const apiClient = buildApiClient({
      getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(500)),
    });

    const result = await loadTemplateDetailData(publicOptions('camping-checklist'), { apiClient });

    expect(result).toEqual({ kind: 'error', message: 'HTTP 500' });
  });

  it('reports a network failure as an error', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    const result = await loadTemplateDetailData(publicOptions(TEMPLATE_UUID), { apiClient });

    expect(result.kind).toBe('error');
  });

  it('keeps a 404, a private template and another owner as not found', async () => {
    const missing = await loadTemplateDetailData(publicOptions('camping-checklist'), {
      apiClient: buildApiClient({ getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(404)) }),
    });
    const privateTemplate = await loadTemplateDetailData(publicOptions('camping-checklist'), {
      apiClient: buildApiClient({
        getTemplateBySlug: vi.fn().mockResolvedValue(serverRow({ is_public: false })),
      }),
    });
    const otherOwner = await loadTemplateDetailData(publicOptions('camping-checklist'), {
      apiClient: buildApiClient({
        getTemplateBySlug: vi.fn().mockResolvedValue(serverRow({ owner_username: 'bob' })),
      }),
    });

    expect(missing).toEqual({ kind: 'not_found' });
    expect(privateTemplate).toEqual({ kind: 'not_found' });
    expect(otherOwner).toEqual({ kind: 'not_found' });
  });
});

describe('public template with a UUID-shaped slug, which templates saved before such slugs were refused can have', () => {
  const UUID_SLUG = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('loads it by slug after the id lookup finds nothing', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(createApiError(404)),
      getTemplateBySlug: vi.fn().mockResolvedValue(serverRow({ slug: UUID_SLUG })),
    });

    const result = await loadTemplateDetailData(publicOptions(UUID_SLUG), { apiClient });

    expect(apiClient.getTemplateById).toHaveBeenCalledWith(UUID_SLUG);
    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith(UUID_SLUG);
    expect(result.kind === 'ok' ? result.template.id : result).toBe(TEMPLATE_UUID);
  });

  it.each([
    ['owned by someone else', { owner_username: 'bob' }],
    ['private', { is_public: false }],
  ])('loads it by slug when the template with that id is %s', async (_label, idRow) => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockResolvedValue(serverRow({ id: UUID_SLUG, title: 'Other', ...idRow })),
      getTemplateBySlug: vi.fn().mockResolvedValue(serverRow({ slug: UUID_SLUG })),
    });

    const result = await loadTemplateDetailData(publicOptions(UUID_SLUG), { apiClient });

    expect(result.kind === 'ok' ? result.template.title : result).toBe('Camping Checklist');
  });

  it('still prefers the template with that id', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockResolvedValue(serverRow()),
    });

    const result = await loadTemplateDetailData(publicOptions(TEMPLATE_UUID), { apiClient });

    expect(result.kind).toBe('ok');
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

  it('is not found when neither lookup finds a public template of this owner', async () => {
    const missing = await loadTemplateDetailData(publicOptions(UUID_SLUG), {
      apiClient: buildApiClient({
        getTemplateById: vi.fn().mockRejectedValue(createApiError(404)),
        getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(404)),
      }),
    });
    const otherOwner = await loadTemplateDetailData(publicOptions(UUID_SLUG), {
      apiClient: buildApiClient({
        getTemplateById: vi.fn().mockResolvedValue(serverRow({ owner_username: 'bob' })),
        getTemplateBySlug: vi.fn().mockResolvedValue(serverRow({ owner_username: 'bob' })),
      }),
    });

    expect(missing).toEqual({ kind: 'not_found' });
    expect(otherOwner).toEqual({ kind: 'not_found' });
  });

  it('reports a server error from the id lookup without a slug lookup', async () => {
    const apiClient = buildApiClient({
      getTemplateById: vi.fn().mockRejectedValue(createApiError(503, { error: 'Service unavailable' })),
    });

    const result = await loadTemplateDetailData(publicOptions(UUID_SLUG), { apiClient });

    expect(result).toEqual({ kind: 'error', message: 'Service unavailable' });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

  it('reports a server error from the slug lookup as an error', async () => {
    const result = await loadTemplateDetailData(publicOptions(UUID_SLUG), {
      apiClient: buildApiClient({
        getTemplateById: vi.fn().mockRejectedValue(createApiError(404)),
        getTemplateBySlug: vi.fn().mockRejectedValue(createApiError(500)),
      }),
    });

    expect(result.kind).toBe('error');
  });
});
