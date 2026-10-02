import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PasswordInput } from '@/components/auth/PasswordInput';
import { click, createFakeContainer, FakeElement, findAll, installFakeDomGlobals } from '../../fixtures/fakeDom';

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
  const typePropertyOf = (id: string) =>
    (
      findAll(container, (node) => node instanceof FakeElement && node.nodeName === 'INPUT' && node.getAttribute('id') === id)[0] as FakeElement & {
        type?: string;
      }
    ).type;
  const toggle = (name: string) =>
    findAll(container, (node) => node instanceof FakeElement && node.nodeName === 'BUTTON' && node.getAttribute('aria-label') === name)[0] as
      | FakeElement
      | undefined;
  return { container, toggle, typePropertyOf };
};

describe('PasswordInput on Log in and Register', () => {
  it('hides the password until its button shows it, and hides it again', async () => {
    const page = await mount();
    expect(page.typePropertyOf('password')).toBe('password');
    expect(page.toggle('Hide password')).toBeUndefined();

    act(() => click(page.container, page.toggle('Show password')!));
    expect(page.typePropertyOf('password')).toBe('text');
    expect(page.toggle('Hide password')).toBeDefined();

    act(() => click(page.container, page.toggle('Hide password')!));
    expect(page.typePropertyOf('password')).toBe('password');
  });

  it('names the button after its field and leaves the other field hidden', async () => {
    const page = await mount();

    act(() => click(page.container, page.toggle('Show confirm password')!));

    expect(page.typePropertyOf('confirmPassword')).toBe('text');
    expect(page.typePropertyOf('password')).toBe('password');
    expect(page.toggle('Hide confirm password')).toBeDefined();
    expect(page.toggle('Show password')).toBeDefined();
  });
});
