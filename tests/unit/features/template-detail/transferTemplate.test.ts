import { describe, expect, it, vi } from 'vitest';

import { transferTemplateToOrganization } from '@/features/template-detail/transferTemplate';
import { createApiError } from '@/lib/api-errors';

import { buildV0DemoPrivateTemplate } from '../../../fixtures/v0DemoFixtures';

const privateTemplate = { ...buildV0DemoPrivateTemplate(), isPublic: false, version: 5 };

const apiClientAnswering = (transferTemplate = vi.fn().mockResolvedValue({ success: true, id: privateTemplate.id, teamId: 'org-acme', version: 6 })) => ({
  transferTemplate,
});

describe('transferTemplateToOrganization', () => {
  it("sends the chosen Organization with the loaded version, shows the Template as the Organization's, which moves the page to its URL, and refreshes the lists", async () => {
    const apiClient = apiClientAnswering();
    const invalidateTemplates = vi.fn();
    const onTemplateChange = vi.fn();

    const result = await transferTemplateToOrganization({ apiClient, invalidateTemplates, onTemplateChange, teamId: 'org-acme', template: privateTemplate });

    expect(apiClient.transferTemplate).toHaveBeenCalledWith(privateTemplate.id, { teamId: 'org-acme', expectedVersion: 5 });
    expect(onTemplateChange).toHaveBeenCalledWith({ ...privateTemplate, ownerType: 'team', teamId: 'org-acme', version: 6 });
    expect(invalidateTemplates).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'ok', templateId: privateTemplate.id, teamId: 'org-acme' });
  });

  it('still answers the transfer when the list refresh fails, since the Template has already moved', async () => {
    const invalidateTemplates = vi.fn().mockRejectedValue(new Error('offline'));

    const result = await transferTemplateToOrganization({ apiClient: apiClientAnswering(), invalidateTemplates, onTemplateChange: vi.fn(), teamId: 'org-acme', template: privateTemplate });

    expect(result).toEqual({ kind: 'ok', templateId: privateTemplate.id, teamId: 'org-acme' });
  });

  it('reloads the Template after an edit conflict and says so, since retrying the stale version would fail the same way', async () => {
    const reloadAfterConflict = vi.fn().mockResolvedValue(undefined);
    const onTemplateChange = vi.fn();
    const apiClient = apiClientAnswering(vi.fn().mockRejectedValue(createApiError(409, { code: 'edit_conflict', error: 'Template changed' })));

    const result = await transferTemplateToOrganization({ apiClient, onTemplateChange, reloadAfterConflict, teamId: 'org-acme', template: privateTemplate });

    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(onTemplateChange).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'error', message: 'This template changed elsewhere. It was reloaded; try again.' });
  });

  it("shows the server's reason when the Organization is at its Template limit or the Template is public", async () => {
    const limitReached = createApiError(403, {
      code: 'limit_reached',
      error: 'This Organization has reached its Template limit.',
      details: { context: 'organization', resource: 'templates' },
    });
    const templatePublic = createApiError(409, { code: 'template_public', error: 'Make the Template private before transferring it to an Organization.' });

    const refusedWith = (error: unknown) =>
      transferTemplateToOrganization({ apiClient: apiClientAnswering(vi.fn().mockRejectedValue(error)), onTemplateChange: vi.fn(), teamId: 'org-acme', template: privateTemplate });

    const atLimit = await refusedWith(limitReached);
    const isPublic = await refusedWith(templatePublic);

    expect(atLimit).toEqual({ kind: 'error', message: 'This Organization has reached its Template limit.' });
    expect(isPublic).toEqual({ kind: 'error', message: 'Make the Template private before transferring it to an Organization.' });
  });

  it('sends nothing when no Template is loaded', async () => {
    const apiClient = apiClientAnswering();

    const result = await transferTemplateToOrganization({ apiClient, onTemplateChange: vi.fn(), teamId: 'org-acme', template: null });

    expect(apiClient.transferTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'error', message: 'Template not found.' });
  });
});
