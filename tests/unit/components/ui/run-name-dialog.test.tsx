import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';

vi.mock('@/components/ui/dialog', async () => (await import('../../../support/overlaysInPlace')).dialogInPlace);

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
    const input = /<input[^>]*id="run-name"[^>]*>/.exec(html)?.[0] ?? '';
    const placeholder = decodeAttribute(/placeholder="([^"]*)"/.exec(input)?.[1] ?? '');

    expect(placeholder.startsWith('TTT')).toBe(true);
    expect(placeholder.length).toBeLessThanOrEqual(160);
    expect(input).toContain('maxLength="160"');
  });

  it('caps a typed run name at the API run title limit', () => {
    const html = renderToStaticMarkup(
      <RunNameDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        templateTitle="Launch checklist"
      />,
    );

    const input = html.match(/<input[^>]*id="run-name"[^>]*>/)?.[0] ?? '';
    expect(input).toMatch(new RegExp(`maxlength="${RUN_TITLE_MAX_LENGTH}"`, 'i'));
  });
});

describe('RunNameDialog wording, the same wherever a Run starts: My Templates, template detail and the public template page', () => {
  const render = (loading = false) =>
    renderToStaticMarkup(
      <RunNameDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        templateTitle="Launch checklist"
        loading={loading}
      />,
    );
  const buttons = (html: string) =>
    [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes, label]) => ({
      disabled: attributes.includes('disabled=""'),
      label,
    }));

  it('asks "Start a Run" with a visibly labelled Run name field, Cancel and Start Run', () => {
    const html = render();

    expect(html).toContain('Start a Run');
    expect(html).toMatch(/<label[^>]*for="run-name"[^>]*>Run name<\/label>/);
    expect(html).toMatch(/<input[^>]*id="run-name"/);
    expect(buttons(html)).toEqual([
      { disabled: false, label: 'Cancel' },
      { disabled: false, label: 'Start Run' },
    ]);
  });

  it('says Starting… and locks its buttons while the run starts', () => {
    expect(buttons(render(true))).toEqual([
      { disabled: true, label: 'Cancel' },
      { disabled: true, label: 'Starting…' },
    ]);
  });
});
