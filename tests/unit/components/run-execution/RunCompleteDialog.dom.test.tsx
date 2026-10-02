import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { renderSettled } from '../../../support/renderInTheDom';

vi.mock('@/components/ui/dialog', async () => (await import('../../../support/overlaysInPlace')).dialogInPlace);

type Props = React.ComponentProps<typeof RunCompleteDialog>;

describe('RunCompleteDialog', () => {
  const render = (props: Partial<Props> = {}) =>
    renderToStaticMarkup(
      <RunCompleteDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open {...props} />,
    );

  it('asks first, says every task is done and that completing freezes the tasks, with buttons that say what they do', () => {
    const html = render();

    expect(html).toContain('<h2>Complete this Run?</h2>');
    expect(html).toContain(
      '<p>Every task is done. Completing the Run freezes its tasks: they can no longer be ticked or unticked.</p>',
    );
    expect([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])).toEqual([
      'Not yet',
      'Complete Run',
    ]);
    expect(html).not.toMatch(/Return to|Public Runs|Congratulations/);
  });

  it('uses theme components and colors only', () => {
    expect(render()).not.toMatch(/green-\d/);
  });

  it('holds both buttons while the completion saves', () => {
    const buttons = render({ completing: true }).match(/<button[^>]*>/g) ?? [];

    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toContain('disabled=""');
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
