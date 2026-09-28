import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RunChangelog } from '@/components/run-execution/RunChangelog';
import type { TemplateHistoryEvent } from '@/lib/api';

describe('RunChangelog', () => {
  const event = (action: string): TemplateHistoryEvent => ({
    id: action,
    action,
    createdAt: '2026-09-01T12:00:00.000Z',
    actor: { id: 'user-1', name: 'Ada' },
  } as TemplateHistoryEvent);

  it('labels Template reconciles and revalidations', () => {
    const markup = renderToStaticMarkup(
      <RunChangelog
        history={{ data: { checklistId: 'run-1', subject: { type: 'user', id: 'user-1' }, events: [
          event('checklist_run.reconciled'),
          event('checklist_run.revalidated'),
        ] } } as never}
      />,
    );

    expect(markup).toContain('Updated from Template');
    expect(markup).toContain('Revalidated against Template');
    expect(markup).not.toContain('checklist_run.');
  });
});
