import React from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';
import { inputNamed, renderSettled } from '../../../support/renderInTheDom';

async function openDialog({ templateTitle = 'Launch checklist', loading = false } = {}) {
  await renderSettled(
    <RunNameDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      templateTitle={templateTitle}
      loading={loading}
    />,
  );
  return screen.getByRole('dialog');
}

const buttonsIn = (dialog: HTMLElement) =>
  within(dialog).getAllByRole('button').map((button) => ({
    disabled: button instanceof HTMLButtonElement && button.disabled,
    label: button.textContent,
  }));

describe('RunNameDialog', () => {
  it('suggests a default name the API accepts and caps a typed name at the limit', async () => {
    const dialog = await openDialog({ templateTitle: 'T'.repeat(160) });
    const field = inputNamed('Run name', dialog);

    expect(field.placeholder.startsWith('TTT')).toBe(true);
    expect(field.placeholder.length).toBeLessThanOrEqual(160);
    expect(field.maxLength).toBe(160);
  });

  it('caps a typed run name at the API run title limit', async () => {
    expect(inputNamed('Run name', await openDialog()).maxLength).toBe(RUN_TITLE_MAX_LENGTH);
  });
});

describe('RunNameDialog wording, the same wherever a Run starts: My Templates, template detail and the public template page', () => {
  it('asks "Start a Run" with a visibly labelled Run name field, Cancel and Start Run', async () => {
    const dialog = await openDialog();

    expect(within(dialog).getByRole('heading').textContent).toBe('Start a Run');
    expect(inputNamed('Run name', dialog).id).toBe('run-name');
    expect(buttonsIn(dialog)).toEqual([
      { disabled: false, label: 'Cancel' },
      { disabled: false, label: 'Start Run' },
      { disabled: false, label: 'Close' },
    ]);
  });

  it('says Starting… and locks its buttons while the run starts', async () => {
    expect(buttonsIn(await openDialog({ loading: true })).slice(0, 2)).toEqual([
      { disabled: true, label: 'Cancel' },
      { disabled: true, label: 'Starting…' },
    ]);
  });
});
