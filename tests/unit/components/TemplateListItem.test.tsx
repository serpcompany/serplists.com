import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
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
      <StaticRouter location="/">
        <TemplateListItem
          onDelete={vi.fn()}
          onStartRun={vi.fn()}
          template={template}
        />
      </StaticRouter>,
    );

    expect(html).toContain('Start Run');
    expect(html).toContain('href="/dashboard/templates/template-1/edit"');
    expect(html).toContain('Delete');
  });

  it('shows no actions to members who cannot run, edit or delete Templates', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <TemplateListItem canEdit={false} template={template} />
      </StaticRouter>,
    );

    expect(html).toContain('Website Launch Checklist');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });

  it('lets a runner start a run without editing or deleting', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <TemplateListItem canEdit={false} onStartRun={vi.fn()} template={template} />
      </StaticRouter>,
    );

    expect(html).toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });
});
