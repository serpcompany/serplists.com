import React from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TemplatePreviewDialog } from '@/components/template-editor/TemplatePreviewDialog';
import { createTemplateEditorRequiredTool } from '@/lib/forms/templateEditorRequiredTools';
import { renderSettled } from '../../../support/renderInTheDom';

describe('the Template editor preview with Required tools in the draft', () => {
  it('lists the draft tools that have a name, trimmed, under the draft title', async () => {
    await renderSettled(
      <TemplatePreviewDialog
        description=""
        onOpenChange={() => undefined}
        open
        requiredTools={[
          createTemplateEditorRequiredTool(),
          { name: '  Time tracker ', url: 'https://example.com/track', required: true },
          { name: '', url: 'https://example.com/unnamed', required: false },
        ]}
        sections={[]}
        title="Launch"
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Template preview' });
    const tools = within(dialog).getByRole('heading', { level: 3, name: 'Required tools' }).closest('section');
    if (!tools) throw new Error('The preview has no Required tools section');
    expect(within(tools).getAllByRole('listitem')).toHaveLength(1);
    expect(within(tools).getByRole('link', { name: 'Time tracker (opens in a new tab)' }).getAttribute('href')).toBe('https://example.com/track');
  });

  it('shows no Required tools section while the draft has none', async () => {
    await renderSettled(
      <TemplatePreviewDialog description="" onOpenChange={() => undefined} open requiredTools={[]} sections={[]} title="Launch" />,
    );

    expect(within(screen.getByRole('dialog', { name: 'Template preview' })).queryByText('Required tools')).toBeNull();
  });
});
