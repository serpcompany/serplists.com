import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { useStateKeptBetweenRenders } = await import('../../support/hookStateSlots');
  return { ...actual, useState: useStateKeptBetweenRenders };
});

import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';

import { findElement } from '../../support/elementTree';
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
      submit: () => (form?.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => undefined }),
      type: (value: string) => (input?.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }),
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
