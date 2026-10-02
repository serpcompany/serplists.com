import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { useStateKeptBetweenRenders } = await import('../../support/hookStateSlots');
  return { ...actual, useState: useStateKeptBetweenRenders };
});

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import { DOUBLE_CLICK_MS } from '@/lib/utils/repeatClick';

import { findElement, handlerOf } from '../../support/elementTree';
import { forgetKeptState, renderUntilNoStateIsSetDuringRender } from '../../support/hookStateSlots';

type DialogProps = Parameters<typeof RunNameDialog>[0];

const mountDialog = (initial: Partial<DialogProps> = {}) => {
  forgetKeptState();
  const onConfirm = vi.fn(async (_name: string) => undefined);
  let props: DialogProps = { loading: false, onConfirm, onOpenChange: vi.fn(), open: true, templateTitle: 'Vendor onboarding', ...initial };
  const render = (next: Partial<DialogProps> = {}) => {
    props = { ...props, ...next };
    const tree = renderUntilNoStateIsSetDuringRender(() => (RunNameDialog as (props: DialogProps) => unknown)(props));
    const input = findElement(tree, (element) => element.props.id === 'run-name');
    const form = findElement(tree, (element) => element.type === 'form');
    return {
      input,
      tree,
      submit: () => handlerOf(form, 'onSubmit')({ preventDefault: () => undefined }),
      type: (value: string) => handlerOf(input, 'onChange')({ target: { value } }),
    };
  };
  return { onConfirm, render };
};

afterEach(() => {
  forgetKeptState();
});

describe('RunNameDialog', () => {
  const typedName = 'Q3 vendor onboarding – ACME (priority)';

  const typeNameAndSubmitWithoutTheRunStarting = () => {
    const dialog = mountDialog();
    dialog.render().type(typedName);
    dialog.render().submit();
    return { dialog, afterFailure: dialog.render() };
  };

  it('keeps the typed name when the start fails, since the page closes the dialog only once the run starts', () => {
    const { dialog, afterFailure } = typeNameAndSubmitWithoutTheRunStarting();

    expect(dialog.onConfirm).toHaveBeenCalledWith(typedName);
    expect(afterFailure.input?.props.value).toBe(typedName);
  });

  it('sends the typed name again when the user retries, not the generated default', () => {
    const { dialog, afterFailure } = typeNameAndSubmitWithoutTheRunStarting();

    afterFailure.submit();
    expect(dialog.onConfirm).toHaveBeenLastCalledWith(typedName);
  });

  it('forgets the name once the dialog closes, so it opens empty next time', () => {
    const dialog = mountDialog();
    dialog.render().type(typedName);
    dialog.render({ open: false });

    expect(dialog.render({ open: true }).input?.props.value).toBe('');
  });

  it('sends the generated name for a blank field without changing the field', () => {
    const dialog = mountDialog();
    dialog.render().type('   ');
    dialog.render().submit();

    expect(dialog.onConfirm).toHaveBeenCalledWith(expect.stringMatching(/^Vendor onboarding - /));
    expect(dialog.render().input?.props.value).toBe('   ');
  });

  it('stops typing at the run title limit, rather than letting the API refuse a longer title with a raw schema error', () => {
    expect(mountDialog().render().input?.props.maxLength).toBe(RUN_TITLE_MAX);
  });

  it('locks the field and ignores another submit while the run is starting', () => {
    const dialog = mountDialog();
    dialog.render().type(typedName);
    const starting = dialog.render({ loading: true });
    starting.submit();

    expect(dialog.onConfirm).not.toHaveBeenCalled();
    expect(starting.input?.props.disabled).toBe(true);
    expect(starting.input?.props.value).toBe(typedName);
  });
});

describe('RunNameDialog, which a double click on a Start Run button opens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const openDialog = () => {
    const onOpenChange = vi.fn();
    const dialog = mountDialog({ onOpenChange });
    const { tree } = dialog.render();
    const content = findElement(tree, (element) => element.type === DialogContent);
    handlerOf(content, 'ref')({});
    const pressOutside = () => {
      const cancel = vi.fn();
      const root = findElement(dialog.render().tree, (element) => element.type === Dialog);
      handlerOf(root, 'onOpenChange')(false, { reason: 'outside-press', cancel });
      return cancel;
    };
    return { dialog, onOpenChange, pressOutside };
  };

  it('stays open when the rest of that double click lands on the overlay', () => {
    const { onOpenChange, pressOutside } = openDialog();

    const cancel = pressOutside();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on a click outside once the double click is over', () => {
    const { onOpenChange, pressOutside } = openDialog();
    vi.advanceTimersByTime(DOUBLE_CLICK_MS);

    const cancel = pressOutside();

    expect(cancel).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits nothing more for the second click of a double click on Start Run, which would start a second run', () => {
    const { dialog } = openDialog();
    const startRun = findElement(dialog.render().tree, (element) => element.props.type === 'submit');
    const click = (detail: number) => {
      const event = { detail, preventDefault: vi.fn() };
      handlerOf(startRun, 'onClick')(event);
      return event.preventDefault;
    };

    expect(click(1)).not.toHaveBeenCalled();
    expect(click(2)).toHaveBeenCalledTimes(1);
  });
});
