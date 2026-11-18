import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportTemplateFile } from '@/features/template-detail/templateExport';
import { portableTemplatePackSchema } from '@/lib/schemas/checklistSchema';
import type { ChecklistTemplate } from '@/types/checklist';

const launch: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch Checklist',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Confirm owner' }] }],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  slug: 'launch-checklist',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Export JSON on the template page', () => {
  it('saves the template as a portable pack named after its slug', async () => {
    const files: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => {
      if (file instanceof Blob) files.push(file);
      return 'blob:template-export';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const savedAs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function save(this: HTMLAnchorElement) {
      savedAs.push(this.download);
    });

    const result = exportTemplateFile({
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: true },
      template: launch,
    });

    expect(result).toEqual({ kind: 'ok', assetWarnings: 0 });
    expect(savedAs).toEqual(['launch-checklist.json']);
    const [file] = files;
    if (!file) throw new Error('No file was saved');
    const pack = portableTemplatePackSchema.parse(JSON.parse(await file.text()));
    expect(pack.templates.map(({ title }) => title)).toEqual(['Launch Checklist']);
  });
});
