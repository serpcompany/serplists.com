import { describe, expect, it } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import {
  getRevalidateRunErrorMessage,
  getTemplateChangeErrorMessage,
  isStaleRecordError,
} from '@/lib/editConflicts';

const editConflict = createApiError(409, {
  error: 'Checklist run changed since it was loaded. Refresh before revalidating.',
  code: 'edit_conflict',
});
const sharedRunConflict = createApiError(409, { error: 'Make the run private first.', code: 'shared_run_conflict' });
const archived = createApiError(404, { error: 'Checklist not found' });

describe('isStaleRecordError', () => {
  it('matches answers that mean the cached copy is out of date', () => {
    expect(isStaleRecordError(editConflict)).toBe(true);
    expect(isStaleRecordError(sharedRunConflict)).toBe(true);
    expect(isStaleRecordError(archived)).toBe(true);
  });

  it('ignores failures a refresh cannot fix', () => {
    expect(isStaleRecordError(createApiError(409, { error: 'Conflict', code: 'limit_reached' }))).toBe(false);
    expect(isStaleRecordError(createApiError(500, { error: 'Internal error' }))).toBe(false);
    expect(isStaleRecordError(new Error('offline'))).toBe(false);
  });
});

describe('conflict messages', () => {
  // The list or template is refreshed automatically, so "Refresh before ..." would mislead.
  it('says the run list was refreshed instead of asking for a refresh', () => {
    expect(getRevalidateRunErrorMessage(editConflict)).toBe('This run changed elsewhere. The list was refreshed; try again if it still needs revalidation.');
    expect(getRevalidateRunErrorMessage(sharedRunConflict)).toBe('This run changed elsewhere. The list was refreshed; try again if it still needs revalidation.');
    expect(getRevalidateRunErrorMessage(archived)).toBe('This run is no longer available. The list was refreshed.');
    expect(getRevalidateRunErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(getRevalidateRunErrorMessage('boom')).toBe('Unable to revalidate run');
  });

  it('says the template was reloaded', () => {
    const templateConflict = createApiError(409, { error: 'Template changed since it was loaded.', code: 'edit_conflict' });
    expect(getTemplateChangeErrorMessage(templateConflict, 'Failed')).toBe('This template changed elsewhere. It was reloaded; try again.');
    expect(getTemplateChangeErrorMessage(archived, 'Failed')).toBe('This template is no longer available.');
    expect(getTemplateChangeErrorMessage(new Error('Forbidden'), 'Failed')).toBe('Forbidden');
    expect(getTemplateChangeErrorMessage(undefined, 'Failed')).toBe('Failed');
  });
});
