import { describe, expect, it } from 'vitest';

import { baseRun, renderRunPage } from '../../support/checklistRunPage';
import type { RequiredTool } from '@/lib/schemas/requiredTools';
import type { ChecklistRun } from '@/types/checklist';

const SOURCE_TOOLS = [
  { name: 'Time tracker', url: 'https://example.com/track', required: true },
  { name: 'Slideshow app', url: 'https://example.com/slides', required: false },
];

const runWhoseSourceHas = (requiredTools: RequiredTool[] | undefined): ChecklistRun => ({
  ...baseRun,
  provenance: { origin: 'web', startedBy: null, template: { id: 'template-1', title: 'Launch', requiredTools, version: 1 } },
});

describe("the Run page's Required tools, the source Template's as the API sent them", () => {
  it('lists them in a card, each linking to its site in a new tab and marked Required or Optional', () => {
    const html = renderRunPage(runWhoseSourceHas(SOURCE_TOOLS), { selectedItemId: 'item-1' });

    expect(html).toContain('Required tools');
    expect(html).toContain('href="https://example.com/track"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/Slideshow app[\s\S]*Optional/);
  });

  it('shows nothing when the source Template has no tools or the viewer may not see it', () => {
    for (const run of [runWhoseSourceHas([]), runWhoseSourceHas(undefined), baseRun]) {
      expect(renderRunPage(run, { selectedItemId: 'item-1' })).not.toContain('Required tools');
    }
  });

  it('leaves them off the shared run page', () => {
    expect(renderRunPage(runWhoseSourceHas(SOURCE_TOOLS), { selectedItemId: 'item-1', shared: true })).not.toContain('Required tools');
  });
});
