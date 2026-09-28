import { describe, expect, it, vi } from 'vitest';

import {
  applyTemplateSaveResult,
  createTemplateDetailLoader,
  type TemplateDetailSource,
  type TemplateDetailViewState,
} from '@/features/template-detail/templateDetailLoader';
import type { ChecklistTemplate } from '@/types/checklist';

// The visibility switch saves the whole template, which bumps its version. It used to learn
// the new version only because every save reloaded the workspace list. A save no longer does
// that, so the page keeps the version the PUT answer returned.

const shown: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [],
  userId: 'owner-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isPublic: false,
  slug: 'launch-checklist',
  categories: [],
  tags: [],
  version: 3,
};

const source = (cached: ChecklistTemplate[]): TemplateDetailSource => ({
  mode: 'private',
  identifier: 'template-1',
  getCachedTemplate: (id: string) => cached.find((template) => template.id === id),
});

describe('visibility switch saves', () => {
  it('shows the stored version, so the next switch sends a current expected_version', async () => {
    const states: TemplateDetailViewState[] = [];
    const loader = createTemplateDetailLoader({
      load: vi.fn(async () => ({ template: shown, notFound: false })),
      onChange: (state) => states.push(state),
    });
    loader.sync(source([shown]), 'owner-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    loader.setTemplate(applyTemplateSaveResult(shown, { isPublic: true }, { version: 4, slug: 'launch-checklist' }));
    // The list was only marked stale: its copy still has version 3, which must not undo the save.
    loader.sync(source([shown]), 'owner-1');

    const latest = states[states.length - 1].template;
    expect(latest).toMatchObject({ id: 'template-1', isPublic: true, version: 4, slug: 'launch-checklist' });
  });

  it('keeps the shown slug when the answer has none', () => {
    expect(applyTemplateSaveResult(shown, { isPublic: true }, { version: 3 })).toMatchObject({
      slug: 'launch-checklist',
      version: 3,
      isPublic: true,
    });
  });
});
