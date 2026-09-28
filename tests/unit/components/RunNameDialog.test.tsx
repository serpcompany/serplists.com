import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vitest runs without a DOM, so this file keeps RunNameDialog's useState slots between calls
// of the component, the way React keeps them between renders, and drives its handlers.
const hooks = vi.hoisted(() => {
  const state = { cursor: 0, rendering: false, setDuringRender: false, slots: [] as unknown[] };
  const useState = <T,>(initial: T | (() => T)) => {
    const slot = state.cursor++;
    if (!(slot in state.slots)) {
      state.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const set = (next: T | ((previous: T) => T)) => {
      state.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(state.slots[slot] as T) : next;
      if (state.rendering) state.setDuringRender = true;
    };
    return [state.slots[slot] as T, set] as const;
  };
  return { state, useState };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: hooks.useState };
});

import { RunNameDialog } from '@/components/ui/run-name-dialog';

type AnyElement = React.ReactElement<Record<string, unknown>>;
type DialogProps = Parameters<typeof RunNameDialog>[0];

const findElement = (node: unknown, match: (element: AnyElement) => boolean): AnyElement | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!React.isValidElement(node)) return undefined;
  const element = node as AnyElement;
  return match(element) ? element : findElement(element.props.children, match);
};

// Mounts the dialog; each call of the result renders it again with the state it kept.
const mountDialog = (initial: Partial<DialogProps> = {}) => {
  hooks.state.slots = [];
  const onConfirm = vi.fn(async (_name: string) => undefined);
  let props: DialogProps = { loading: false, onConfirm, onOpenChange: vi.fn(), open: true, templateTitle: 'Vendor onboarding', ...initial };
  const render = (next: Partial<DialogProps> = {}) => {
    props = { ...props, ...next };
    let tree: unknown;
    // A state update during render renders again, as React does.
    do {
      hooks.state.cursor = 0;
      hooks.state.setDuringRender = false;
      hooks.state.rendering = true;
      tree = (RunNameDialog as (props: DialogProps) => unknown)(props);
      hooks.state.rendering = false;
    } while (hooks.state.setDuringRender);
    const input = findElement(tree, (element) => element.props.id === 'runName');
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
  hooks.state.slots = [];
});

describe('RunNameDialog', () => {
  const typedName = 'Q3 vendor onboarding – ACME (priority)';

  it('keeps the typed name when the start fails and the dialog stays open', () => {
    const dialog = mountDialog();
    dialog.render().type(typedName);
    dialog.render().submit();

    // The page closes the dialog only when the run starts; here it stayed open.
    const afterFailure = dialog.render();
    expect(dialog.onConfirm).toHaveBeenCalledWith(typedName);
    expect(afterFailure.input?.props.value).toBe(typedName);

    // Trying again sends the same name, not the generated default.
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
