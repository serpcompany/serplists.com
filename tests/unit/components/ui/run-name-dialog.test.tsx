import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { MAX_RUN_TITLE_LENGTH } from '@/lib/runName';

// Radix portals render nothing on the server, so render the dialog parts inline.
vi.mock('@/components/ui/dialog', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

describe('RunNameDialog', () => {
  it('caps a typed run name at the API run title limit', () => {
    const html = renderToStaticMarkup(
      <RunNameDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        templateTitle="Launch checklist"
      />,
    );

    expect(html).toMatch(/<input[^>]*id="runName"[^>]*>/);
    const input = html.match(/<input[^>]*id="runName"[^>]*>/)?.[0] ?? '';
    expect(input).toMatch(new RegExp(`maxlength="${MAX_RUN_TITLE_LENGTH}"`, 'i'));
  });
});
