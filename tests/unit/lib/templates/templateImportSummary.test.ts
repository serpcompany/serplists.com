import { describe, expect, it } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import {
  formatImportFailure,
  formatImportSummaryMessage,
  getImportSummaryFromError,
} from '@/lib/templates/templateImportSummary';
import type { TemplateImportSummary } from '@/types/checklist';

const allFailed: TemplateImportSummary = {
  total: 1,
  imported: 0,
  failed: [{ index: 0, title: 'A', reason: 'Duplicate item id: x', code: 'invalid_sections' }],
  successes: [],
};

describe('getImportSummaryFromError', () => {
  it('returns the summary the API sends when every template fails', () => {
    const error = createApiError(400, { error: 'Template import failed', code: 'template_import_failed', details: allFailed });

    expect(getImportSummaryFromError(error)).toEqual(allFailed);
  });

  it.each([
    ['another 400 with details', createApiError(400, { error: 'Import limit', code: 'import_limit', details: { limit: 5, current: 6 } })],
    ['malformed details', createApiError(400, { error: 'Template import failed', code: 'template_import_failed', details: { total: 'x' } })],
    ['missing details', createApiError(400, { error: 'Template import failed', code: 'template_import_failed' })],
    ['a failure without a reason', createApiError(400, {
      error: 'Template import failed',
      code: 'template_import_failed',
      details: { ...allFailed, failed: [{ index: 0, title: 'A', code: 'invalid_sections' }] },
    })],
    ['an upgrade prompt', createApiError(403, { error: 'Upgrade', code: 'upgrade_required' })],
    ['a plain error', new Error('Network down')],
  ])('returns null for %s, so the usual error handling runs', (_label, error) => {
    expect(getImportSummaryFromError(error)).toBeNull();
  });
});

describe('formatImportSummaryMessage', () => {
  it('names the failed templates when nothing imported', () => {
    expect(formatImportSummaryMessage(allFailed)).toEqual({ kind: 'error', message: 'Imported 0/1. Failed: A' });
  });

  it('names at most two and counts the rest', () => {
    const summary: TemplateImportSummary = {
      total: 5,
      imported: 1,
      failed: ['A', '', 'C', 'D'].map((title, index) => ({ index, title, reason: 'x', code: 'insert_failed' as const })),
      successes: [{ index: 4, title: 'E', id: 'e', slug: 'e', visibility: 'private' }],
    };

    expect(formatImportSummaryMessage(summary)).toEqual({ kind: 'error', message: 'Imported 1/5. Failed: A, Template 2 +2 more' });
  });

  it('reports a clean import as a success', () => {
    const summary: TemplateImportSummary = { total: 1, imported: 1, failed: [], successes: [{ index: 0, title: 'A', id: 'a', slug: 'a', visibility: 'public' }] };

    expect(formatImportSummaryMessage(summary)).toEqual({ kind: 'success', message: 'Successfully imported 1/1 templates' });
  });
});

describe('formatImportFailure', () => {
  it('shows the title and reason, naming an untitled template by its position', () => {
    expect(formatImportFailure(allFailed.failed[0])).toBe('A: Duplicate item id: x');
    expect(formatImportFailure({ index: 2, title: '', reason: 'Bad', code: 'invalid_fields' })).toBe('Template 3: Bad');
  });
});
