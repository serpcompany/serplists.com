import { describe, expect, it, vi } from 'vitest';

import {
  mapActionFailure,
  mapTemplateChangeFailure,
  resolveShareOwnerTemplate,
} from '@/features/template-detail/templateDetailApi';
import { createApiError } from '@/lib/api-errors';
import type { ChecklistTemplate } from '@/types/checklist';

const someoneElsesTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [],
  userId: 'user-2',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
};

describe('the outcome a template page shows for a failed action', () => {
  it('sends a visitor whose session ended to sign in', () => {
    expect(mapActionFailure(createApiError(401, { error: 'Unauthorized' }), 'Failed to save template')).toEqual({ kind: 'login_required' });
  });

  it("shows the server's reason for a conflict when the template could not be reloaded", async () => {
    const reloadAfterConflict = vi.fn().mockRejectedValue(new Error('offline'));

    const result = await mapTemplateChangeFailure(
      createApiError(409, { code: 'edit_conflict', error: 'Template changed since it was loaded' }),
      'Failed to share this template.',
      reloadAfterConflict,
    );

    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'error', message: 'Template changed since it was loaded' });
  });
});

describe("sharing a template someone else created", () => {
  it('keeps the loaded copy when the Creator profile cannot be read', async () => {
    const getProfileById = vi.fn().mockRejectedValue(new Error('offline'));

    const shown = await resolveShareOwnerTemplate(someoneElsesTemplate, { userId: 'user-1', username: 'alice' }, { getProfileById });

    expect(getProfileById).toHaveBeenCalledWith('user-2');
    expect(shown).toBe(someoneElsesTemplate);
  });
});
