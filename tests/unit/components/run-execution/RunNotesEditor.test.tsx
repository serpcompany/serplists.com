import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';

const render = (props: { draft?: string; savedValue?: string }) =>
  renderToStaticMarkup(
    <RunNotesEditor
      label="Task notes"
      onDraftChange={vi.fn()}
      onSave={vi.fn(async () => true)}
      {...props}
    />,
  );

describe('RunNotesEditor', () => {
  it('shows the unsaved draft over the saved notes and keeps Save enabled', () => {
    // The user saved "abc", kept typing, and the save returned "abc".
    const html = render({ draft: 'abcdef', savedValue: 'abc' });

    expect(html).toContain('>abcdef</textarea>');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save notes/);
  });

  it('shows the saved notes with Save disabled when there is no draft', () => {
    const html = render({ savedValue: 'abc' });

    expect(html).toContain('>abc</textarea>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save notes/);
  });
});
