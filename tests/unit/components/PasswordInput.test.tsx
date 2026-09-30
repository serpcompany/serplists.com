import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PasswordInput } from '@/components/auth/PasswordInput';
import { click, createFakeContainer, FakeElement, findAll, installFakeDomGlobals } from '../../fixtures/fakeDom';

// Log in and Register show or hide a typed password with a button named after its field, and
// each field shows or hides on its own.
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
  const container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () =>
    root?.render(
      <>
        <PasswordInput id="password" />
        <PasswordInput id="confirmPassword" toggleLabel="confirm password" />
      </>,
    ),
  );
  // React DOM sets an input's type as a property.
  const input = (id: string) =>
    findAll(container, (node) => node instanceof FakeElement && node.nodeName === 'INPUT' && node.getAttribute('id') === id)[0] as FakeElement & {
      type?: string;
    };
  const toggle = (name: string) =>
    findAll(container, (node) => node instanceof FakeElement && node.nodeName === 'BUTTON' && node.getAttribute('aria-label') === name)[0] as
      | FakeElement
      | undefined;
  return { container, input, toggle };
};

describe('PasswordInput', () => {
  it('hides the password until its button shows it, and hides it again', async () => {
    const page = await mount();
    expect(page.input('password').type).toBe('password');
    expect(page.toggle('Hide password')).toBeUndefined();

    act(() => click(page.container, page.toggle('Show password')!));
    expect(page.input('password').type).toBe('text');
    expect(page.toggle('Hide password')).toBeDefined();

    act(() => click(page.container, page.toggle('Hide password')!));
    expect(page.input('password').type).toBe('password');
  });

  it('names the button after its field and leaves the other field hidden', async () => {
    const page = await mount();

    act(() => click(page.container, page.toggle('Show confirm password')!));

    expect(page.input('confirmPassword').type).toBe('text');
    expect(page.input('password').type).toBe('password');
    expect(page.toggle('Hide confirm password')).toBeDefined();
    expect(page.toggle('Show password')).toBeDefined();
  });
});
