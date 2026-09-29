import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { click, createFakeContainer, FakeElement, findAll, installFakeDomGlobals, type FakeNode } from '../../../fixtures/fakeDom';

// Completing a Run freezes its tasks, so the dialog asks first and says so: "Complete Run"
// completes it, "Not yet" keeps it in progress. Its buttons say what they do (they used to read
// "Return to Dashboard" or "Return to Public Runs" and complete the Run).

// Render the dialog inline when open: Base UI's portal does not render here.
vi.mock('@/components/ui/dialog', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: Pass,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  };
});

type Props = React.ComponentProps<typeof RunCompleteDialog>;

describe('RunCompleteDialog', () => {
  const render = (props: Partial<Props> = {}) =>
    renderToStaticMarkup(
      <RunCompleteDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open {...props} />,
    );

  it('says every task is done and that completing freezes the tasks', () => {
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
    // Theme components and colors only.
    expect(html).not.toMatch(/green-\d/);
  });

  it('holds both buttons while the completion saves', () => {
    const buttons = render({ completing: true }).match(/<button[^>]*>/g) ?? [];

    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toContain('disabled=""');
  });
});

describe('RunCompleteDialog buttons', () => {
  let restoreGlobals: () => void = () => {};
  let root: Root | null = null;
  beforeAll(() => {
    restoreGlobals = installFakeDomGlobals();
  });
  afterAll(() => restoreGlobals());
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  const mount = async () => {
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    const container = createFakeContainer();
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<RunCompleteDialog onComplete={onComplete} onOpenChange={onOpenChange} open />);
    });
    const button = (label: string): FakeNode => {
      const [found] = findAll(
        container,
        (node) => node instanceof FakeElement && node.nodeName === 'BUTTON' && node.textContent === label,
      );
      if (!found) throw new Error(`No button labelled ${label}`);
      return found;
    };
    return { button, container, onComplete, onOpenChange };
  };

  it('completes the Run from "Complete Run" and closes without completing from "Not yet"', async () => {
    const dialog = await mount();

    act(() => click(dialog.container, dialog.button('Not yet'), { detail: 1 }));
    expect(dialog.onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog.onComplete).not.toHaveBeenCalled();

    act(() => click(dialog.container, dialog.button('Complete Run'), { detail: 1 }));
    expect(dialog.onComplete).toHaveBeenCalledTimes(1);
  });

  // The dialog opens as the last task is ticked, often mid double click.
  it('ignores the rest of a double click on either button', async () => {
    const dialog = await mount();

    act(() => click(dialog.container, dialog.button('Not yet'), { detail: 2 }));
    act(() => click(dialog.container, dialog.button('Complete Run'), { detail: 2 }));

    expect(dialog.onOpenChange).not.toHaveBeenCalled();
    expect(dialog.onComplete).not.toHaveBeenCalled();
  });
});
