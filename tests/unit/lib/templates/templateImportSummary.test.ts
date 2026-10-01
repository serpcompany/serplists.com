import { describe, expect, it } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { addPublicTemplatesToPack } from '@/lib/templates/portableExport';
import {
  formatExportSummaryMessage,
  formatImportFailure,
  formatImportSummaryMessage,
  getExportSummary,
  getImportSummaryFromError,
} from '@/lib/templates/templateImportSummary';
import { buildPortableTemplatePack } from '@functions/api/utils/template-portable';
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

describe('export summary', () => {
  const source = (id: string, title: string, sections: unknown[]) => ({
    id, title, description: '', type: 'checklist', seoTitle: '', seoDescription: '',
    sections, categories: [], tags: [], isPublic: false, slug: id,
  });
  const valid = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];
  const noTasks = 'Template has no sections with tasks';
  const packAsTheApiSendsIt = (templates: ReturnType<typeof source>[]) =>
    JSON.parse(JSON.stringify(buildPortableTemplatePack(templates, 'me@example.com')));

  it('reads the templates written and those left out from the pack manifest', () => {
    const pack = packAsTheApiSendsIt([source('a', 'Owned', valid), source('b', 'Launch plan', []), source('c', 'Other', valid)]);

    expect(getExportSummary(pack)).toEqual({ exported: 2, skipped: [{ title: 'Launch plan', reason: noTasks }] });
  });

  it('warns and names each left-out template with its reason, so the backup is not silently incomplete', () => {
    const summary = getExportSummary(packAsTheApiSendsIt([source('a', 'Owned', valid), source('b', 'Launch plan', [])]));

    expect(formatExportSummaryMessage(summary)).toEqual({
      kind: 'warning',
      message: `Exported 1 template. Not exported: Launch plan (${noTasks})`,
    });
  });

  it('also reports public templates the page added that could not be exported', () => {
    const pack = addPublicTemplatesToPack(packAsTheApiSendsIt([source('a', 'Owned', valid)]), [{
      id: 'pub', title: 'Community', description: '', sections: [], userId: 'other', isPublic: true, slug: 'pub',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', categories: [], tags: [],
    }]);

    expect(formatExportSummaryMessage(getExportSummary(pack))).toEqual({
      kind: 'warning',
      message: `Exported 1 template. Not exported: Community (${noTasks})`,
    });
  });

  it('names at most two, counts the rest, and names an untitled template', () => {
    const skipped = ['', 'B', 'C', 'D'].map((title) => ({ title, reason: 'Bad' }));

    expect(formatExportSummaryMessage({ exported: 3, skipped })).toEqual({
      kind: 'warning',
      message: 'Exported 3 templates. Not exported: Untitled template (Bad), B (Bad) +2 more',
    });
  });

  it('is an error when nothing could be exported', () => {
    expect(formatExportSummaryMessage({ exported: 0, skipped: [{ title: 'A', reason: 'Bad' }] }))
      .toEqual({ kind: 'error', message: 'No templates exported. Not exported: A (Bad)' });
    expect(formatExportSummaryMessage({ exported: 0, skipped: [] }))
      .toEqual({ kind: 'error', message: 'No templates exported' });
  });

  it('keeps the success message only when nothing was left out', () => {
    expect(formatExportSummaryMessage(getExportSummary(packAsTheApiSendsIt([source('a', 'A', valid), source('b', 'B', valid)]))))
      .toEqual({ kind: 'success', message: 'Exported 2 templates successfully' });
  });

  it('rejects a response that is not a pack', () => {
    expect(() => getExportSummary({ templates: 'nope' })).toThrow();
  });
});
