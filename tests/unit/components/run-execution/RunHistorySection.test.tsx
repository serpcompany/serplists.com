import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RunHistorySection } from '@/components/run-execution/RunHistorySection';
import type { TemplateHistoryEvent } from '@/lib/api';

const event = (
  action: string,
  actor: TemplateHistoryEvent['actor'],
  metadata?: Record<string, unknown>,
): TemplateHistoryEvent => ({ id: action, action, actor, createdAt: '2026-07-03T12:00:00.000Z', metadata });

const owner = { userId: 'user-1', name: 'Jane Runner' };

const render = (events: TemplateHistoryEvent[]) =>
  renderToStaticMarkup(
    <RunHistorySection
      history={{
        data: { checklistId: 'run-1', events, subject: { type: 'user', id: 'user-1' } },
        isError: false,
        isLoading: false,
      }}
    />,
  );

// The API writes more run actions than created, updated and deleted; each needs a label.
describe('RunHistorySection', () => {
  it('labels Template reconciles and stopped shares', () => {
    const html = render([
      event('checklist_run.reconciled', owner),
      event('checklist_run.share_revoked', owner),
    ]);

    expect(html).toContain('Updated from Template');
    expect(html).toContain('Stopped sharing');
    expect(html).not.toContain('checklist_run.');
  });

  it('labels share, guest, revalidate and restore events instead of showing raw action ids', () => {
    const html = render([
      event('checklist_run.share_created', owner),
      event('checklist_run.shared_updated', { userId: null, name: null, username: null, email: null }, { source: 'public_share' }),
      event('checklist_run.revalidated', owner),
      event('checklist_run.restored', owner),
    ]);

    expect(html).toContain('Created share link');
    expect(html).toContain('Updated via shared link');
    expect(html).toContain('Revalidated run');
    expect(html).toContain('Restored run');
    expect(html).toContain('Guest via shared link');
    expect(html).not.toContain('checklist_run.');
    expect(html).not.toContain('Unknown user');
  });

  it('names a signed-in user who edited through the share link', () => {
    const html = render([event('checklist_run.shared_updated', owner, { source: 'public_share' })]);

    expect(html).toContain('Jane Runner');
    expect(html).not.toContain('Guest via shared link');
  });

  it('keeps the MCP actor format', () => {
    const html = render([
      event('checklist_run.updated', owner, { source: 'mcp', personalRunKeyName: 'Codex SOP Runner' }),
    ]);

    expect(html).toContain('Codex SOP Runner via MCP · authorized by Jane Runner');
  });

  it('shows an action it does not know as words, never as a dotted id', () => {
    const html = render([event('checklist_run.archived_forever', owner)]);

    expect(html).toContain('Archived forever');
    expect(html).not.toContain('checklist_run.');
  });
});
