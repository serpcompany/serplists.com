import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { renderSettled } from '../../../support/renderInTheDom';

type Props = React.ComponentProps<typeof RunCompleteDialog>;

describe('RunCompleteDialog', () => {
  const openDialog = async (props: Partial<Props> = {}) => {
    await renderSettled(<RunCompleteDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open {...props} />);
    return screen.getByRole('dialog');
  };

  const buttonNamed = (dialog: HTMLElement, name: string) => {
    const button = within(dialog).getByRole('button', { name });
    if (!(button instanceof HTMLButtonElement)) throw new Error(`${name} is not a button`);
    return button;
  };

  it('asks first, says every task is done and that completing freezes the tasks, with buttons that say what they do', async () => {
    const dialog = await openDialog();

    expect(within(dialog).getByRole('heading').textContent).toBe('Complete this Run?');
    expect(within(dialog).getByRole('paragraph').textContent).toBe(
      'Every task is done. Completing the Run freezes its tasks: they can no longer be ticked or unticked.',
    );
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Not yet',
      'Complete Run',
      'Close',
    ]);
    expect(dialog.textContent).not.toMatch(/Return to|Public Runs|Congratulations/);
  });

  it('uses theme components and colors only', async () => {
    expect((await openDialog()).outerHTML).not.toMatch(/green-\d/);
  });

  it('holds both answers while the completion saves', async () => {
    const dialog = await openDialog({ completing: true });

    expect(buttonNamed(dialog, 'Not yet').disabled).toBe(true);
    expect(buttonNamed(dialog, 'Complete Run').disabled).toBe(true);
  });

  it('cannot be closed with Close or Escape while the completion saves, so the request is not left running behind it', async () => {
    const onOpenChange = vi.fn();
    const dialog = await openDialog({ completing: true, onOpenChange });

    expect(buttonNamed(dialog, 'Close').disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes with Escape when nothing is saving', async () => {
    const onOpenChange = vi.fn();
    const dialog = await openDialog({ onOpenChange });

    expect(buttonNamed(dialog, 'Close').disabled).toBe(false);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('RunCompleteDialog buttons', () => {
  const mount = async () => {
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    await renderSettled(<RunCompleteDialog onComplete={onComplete} onOpenChange={onOpenChange} open />);
    const button = (name: string) => screen.getByRole('button', { name });
    return { button, onComplete, onOpenChange };
  };

  it('completes the Run from "Complete Run" and closes without completing from "Not yet"', async () => {
    const dialog = await mount();

    fireEvent.click(dialog.button('Not yet'), { detail: 1 });
    expect(dialog.onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog.onComplete).not.toHaveBeenCalled();

    fireEvent.click(dialog.button('Complete Run'), { detail: 1 });
    expect(dialog.onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores the rest of a double click on either button, since the dialog opens as the last task is ticked, often mid double click', async () => {
    const dialog = await mount();

    fireEvent.click(dialog.button('Not yet'), { detail: 2 });
    fireEvent.click(dialog.button('Complete Run'), { detail: 2 });

    expect(dialog.onOpenChange).not.toHaveBeenCalled();
    expect(dialog.onComplete).not.toHaveBeenCalled();
  });
});
