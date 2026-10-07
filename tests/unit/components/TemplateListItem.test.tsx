import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import { PRIVATE_LAUNCH_TEMPLATE } from '../../fixtures/dashboardTemplate';

const template = PRIVATE_LAUNCH_TEMPLATE;

describe('TemplateListItem', () => {
  it('keeps start, edit, and delete actions available in dashboard list view', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <TemplateListItem
        context={PERSONAL_CONSOLE}
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
      <TemplateListItem canEdit={false} context={PERSONAL_CONSOLE} template={template} />,
    );

    expect(html).toContain('Website Launch Checklist');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });

  it('lets a runner start a run without editing or deleting', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <TemplateListItem canEdit={false} context={PERSONAL_CONSOLE} onStartRun={vi.fn()} template={template} />,
    );

    expect(html).toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });
});
