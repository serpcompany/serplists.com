import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunNameDialog } from '@/components/ui/run-name-dialog';

// Render the dialog inline: the Radix portal does not render on the server.
vi.mock('@/components/ui/dialog', async () => {
  const { createElement, Fragment } = await import('react');
  const passThrough = ({ children }: { children?: React.ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Dialog: passThrough,
    DialogContent: passThrough,
    DialogDescription: passThrough,
    DialogFooter: passThrough,
    DialogHeader: passThrough,
    DialogTitle: passThrough,
  };
});

const decodeAttribute = (value: string) =>
  value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

describe('RunNameDialog', () => {
  it('suggests a default name the API accepts and caps a typed name at the limit', () => {
    const html = renderToStaticMarkup(
      <RunNameDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        templateTitle={'T'.repeat(160)}
      />,
    );
    const input = /<input[^>]*id="runName"[^>]*>/.exec(html)?.[0] ?? '';
    const placeholder = decodeAttribute(/placeholder="([^"]*)"/.exec(input)?.[1] ?? '');

    expect(placeholder.startsWith('TTT')).toBe(true);
    expect(placeholder.length).toBeLessThanOrEqual(160);
    expect(input).toContain('maxLength="160"');
  });
});
