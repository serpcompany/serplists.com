import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import type { ChecklistTemplate } from '@/types/checklist';

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Website Launch Checklist',
  description: 'Launch workflow',
  type: 'checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  categories: [],
  tags: [],
};

describe('TemplateListItem', () => {
  it('keeps start, edit, and delete actions available in dashboard list view', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TemplateListItem
          onDelete={vi.fn()}
          onStartRun={vi.fn()}
          template={template}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Start Run');
    expect(html).toContain('href="/dashboard/templates/template-1/edit"');
    expect(html).toContain('Delete');
  });
});
