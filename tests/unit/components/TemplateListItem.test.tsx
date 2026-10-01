import '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

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
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <TemplateListItem
        onDelete={vi.fn()}
        onStartRun={vi.fn()}
        template={template}
      />,
    );

    expect(html).toContain('Start Run');
    expect(html).toContain('href="/dashboard/templates/template-1/edit/"');
    expect(html).toContain('Delete</button>');
  });

  it('shows no actions to members who cannot run, edit or delete Templates', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <TemplateListItem canEdit={false} template={template} />,
    );

    expect(html).toContain('Website Launch Checklist');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });

  it('lets a runner start a run without editing or deleting', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <TemplateListItem canEdit={false} onStartRun={vi.fn()} template={template} />,
    );

    expect(html).toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });
});
