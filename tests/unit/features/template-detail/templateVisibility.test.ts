import { assert, describe, expect, it, vi } from 'vitest';

import { applyTemplateSaveResult } from '@/features/template-detail/templateDetailApi';
import { setTemplateVisibility } from '@/features/template-detail/templateVisibility';
import type { TemplateUpdater } from '@/features/template-detail/useTemplateDetailRecord';
import { createApiError } from '@/lib/api-errors';
import type { ChecklistTemplate } from '@/types/checklist';

import { templateDetailApiClient } from '../../../fixtures/templateDetailApiClient';

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

const buildApiClient = (updateTemplate = vi.fn().mockResolvedValue({ success: true })) =>
  templateDetailApiClient({ updateTemplate });

const recordTemplateUpdates = () => vi.fn<(update: TemplateUpdater) => void>();

const applyTheUpdaterAsReactWould = (
  onTemplateChange: ReturnType<typeof recordTemplateUpdates>,
  current: ChecklistTemplate | null,
) => {
  const updater = onTemplateChange.mock.calls[0]?.[0];
  assert.exists(updater);
  return updater(current);
};

describe('setTemplateVisibility', () => {
  it('sends only the visibility flag with the loaded version, and applies the new visibility', async () => {
    const apiClient = buildApiClient();
    const onTemplateChange = recordTemplateUpdates();
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
    expect(apiClient.updateTemplate).toHaveBeenCalledWith('template-1', {
      expected_version: 3,
      is_public: false,
    });
    expect(applyTheUpdaterAsReactWould(onTemplateChange, template)).toEqual({ ...template, isPublic: false });
    expect(invalidateTemplates).toHaveBeenCalledTimes(1);
  });

  it('leaves another template alone if the page moved on during the request', async () => {
    const onTemplateChange = recordTemplateUpdates();

    await setTemplateVisibility({
      apiClient: buildApiClient(),
      canEdit: true,
      isPublic: false,
      onTemplateChange,
      template: buildTemplate(),
    });

    const other = buildTemplate({ id: 'template-2', isPublic: true });
    expect(applyTheUpdaterAsReactWould(onTemplateChange, other)).toBe(other);
  });

  it('keeps the shown visibility when the server refuses the change', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(
        createApiError(409, { code: 'edit_conflict', error: 'Template changed' }),
      ),
    );
    const onTemplateChange = recordTemplateUpdates();
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

  it('keeps the version and slug the server stored, so the next switch sends a current expected_version without a list reload', async () => {
    const onTemplateChange = recordTemplateUpdates();
    const template = buildTemplate();

    await setTemplateVisibility({
      apiClient: buildApiClient(vi.fn().mockResolvedValue({ version: 4, slug: 'camping-checklist-2' })),
      canEdit: true,
      isPublic: false,
      onTemplateChange,
      template,
    });

    expect(applyTheUpdaterAsReactWould(onTemplateChange, template)).toEqual({
      ...template,
      isPublic: false,
      version: 4,
      slug: 'camping-checklist-2',
    });
  });

  it('reloads the stored template after an edit conflict and says so, since a retry from the stale copy would fail the same way', async () => {
    const reloadAfterConflict = vi.fn().mockResolvedValue(undefined);
    const onTemplateChange = recordTemplateUpdates();

    const result = await setTemplateVisibility({
      apiClient: buildApiClient(
        vi.fn().mockRejectedValue(createApiError(409, { code: 'edit_conflict', error: 'Template changed' })),
      ),
      canEdit: true,
      isPublic: false,
      onTemplateChange,
      reloadAfterConflict,
      template: buildTemplate(),
    });

    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'error',
      message: 'This template changed elsewhere. It was reloaded; try again.',
    });
    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  it('does not reload after a failure that is not a stale copy', async () => {
    const reloadAfterConflict = vi.fn().mockResolvedValue(undefined);

    const result = await setTemplateVisibility({
      apiClient: buildApiClient(vi.fn().mockRejectedValue(createApiError(500, { error: 'Server error' }))),
      canEdit: true,
      isPublic: false,
      onTemplateChange: vi.fn(),
      reloadAfterConflict,
      template: buildTemplate(),
    });

    expect(reloadAfterConflict).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'error', message: 'Server error' });
  });

  it('keeps the new visibility when refreshing the lists fails', async () => {
    const onTemplateChange = recordTemplateUpdates();

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

describe('applyTemplateSaveResult', () => {
  it('keeps the loaded version and slug when the answer has none', () => {
    const template = buildTemplate();

    expect(applyTemplateSaveResult(template, { isPublic: false }, { version: 3 })).toMatchObject({
      isPublic: false,
      slug: 'camping-checklist',
      version: 3,
    });
    expect(applyTemplateSaveResult(template, { isPublic: false }, undefined)).toEqual({
      ...template,
      isPublic: false,
    });
  });
});
