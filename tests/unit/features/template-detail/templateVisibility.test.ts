import { describe, expect, it, vi } from 'vitest';

import { setTemplateVisibility } from '@/features/template-detail/templateVisibility';
import { createApiError } from '@/lib/api-errors';
import type { ChecklistTemplate } from '@/types/checklist';

const buildTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: true,
  slug: 'camping-checklist',
  version: 3,
  ...overrides,
});

const buildApiClient = (updateTemplate = vi.fn().mockResolvedValue({ success: true })) => ({
  clonePublicTemplate: vi.fn(),
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  updateTemplate,
});

// Applies the updater the action hands to setTemplate, as React would.
const applyUpdate = (
  onTemplateChange: ReturnType<typeof vi.fn>,
  current: ChecklistTemplate | null,
) => {
  const updater = onTemplateChange.mock.calls[0]?.[0] as (
    value: ChecklistTemplate | null,
  ) => ChecklistTemplate | null;
  return updater(current);
};

describe('setTemplateVisibility', () => {
  it('changes only visibility, so the loaded version stays valid for the next write', async () => {
    const apiClient = buildApiClient();
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();
    const template = buildTemplate();

    const result = await setTemplateVisibility({
      apiClient,
      canEdit: true,
      invalidateTemplates,
      isPublic: false,
      onTemplateChange,
      template,
    });

    expect(result).toEqual({ kind: 'ok' });
    // Visibility alone does not create a template version on the server.
    expect(apiClient.updateTemplate).toHaveBeenCalledWith('template-1', {
      expected_version: 3,
      is_public: false,
    });
    expect(applyUpdate(onTemplateChange, template)).toEqual({ ...template, isPublic: false });
    expect(invalidateTemplates).toHaveBeenCalledTimes(1);
  });

  it('leaves another template alone if the page moved on during the request', async () => {
    const onTemplateChange = vi.fn();

    await setTemplateVisibility({
      apiClient: buildApiClient(),
      canEdit: true,
      isPublic: false,
      onTemplateChange,
      template: buildTemplate(),
    });

    const other = buildTemplate({ id: 'template-2', isPublic: true });
    expect(applyUpdate(onTemplateChange, other)).toBe(other);
  });

  it('keeps the shown visibility when the server refuses the change', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(
        createApiError(409, { code: 'edit_conflict', error: 'Template changed' }),
      ),
    );
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();

    const result = await setTemplateVisibility({
      apiClient,
      canEdit: true,
      invalidateTemplates,
      isPublic: false,
      onTemplateChange,
      template: buildTemplate(),
    });

    expect(result).toEqual({ kind: 'error', message: 'Template changed' });
    expect(onTemplateChange).not.toHaveBeenCalled();
    expect(invalidateTemplates).not.toHaveBeenCalled();
  });

  it('keeps the new visibility when refreshing the lists fails', async () => {
    const onTemplateChange = vi.fn();

    const result = await setTemplateVisibility({
      apiClient: buildApiClient(),
      canEdit: true,
      invalidateTemplates: vi.fn().mockRejectedValue(new Error('refetch failed')),
      isPublic: false,
      onTemplateChange,
      template: buildTemplate(),
    });

    expect(result).toEqual({ kind: 'ok' });
    expect(onTemplateChange).toHaveBeenCalledTimes(1);
  });

  it('sends nothing without edit rights', async () => {
    const apiClient = buildApiClient();

    const result = await setTemplateVisibility({
      apiClient,
      canEdit: false,
      isPublic: false,
      onTemplateChange: vi.fn(),
      template: buildTemplate(),
    });

    expect(result.kind).toBe('error');
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });
});
