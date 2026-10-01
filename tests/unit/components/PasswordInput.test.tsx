import React, { act } from 'react';
import { assert, describe, expect, it } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

import { PasswordInput } from '@/components/auth/PasswordInput';
import { click, FakeElement, findAll } from '../../fixtures/fakeDom';

const fakeDom = aFakeDomForEachTest();
const mount = async () => {
  const { container } = await fakeDom.render(
    <>
      <PasswordInput id="password" />
      <PasswordInput id="confirmPassword" toggleLabel="confirm password" />
    </>,
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
  const press = (name: string) => {
    const button = toggle(name);
    assert.exists(button, `a button named ${name}`);
    act(() => click(container, button));
  };
  return { container, press, toggle, typePropertyOf };
};

describe('PasswordInput on Log in and Register', () => {
  it('hides the password until its button shows it, and hides it again', async () => {
    const page = await mount();
    expect(page.typePropertyOf('password')).toBe('password');
    expect(page.toggle('Hide password')).toBeUndefined();

    page.press('Show password');
    expect(page.typePropertyOf('password')).toBe('text');
    expect(page.toggle('Hide password')).toBeDefined();

    page.press('Hide password');
    expect(page.typePropertyOf('password')).toBe('password');
  });

  it('names the button after its field and leaves the other field hidden', async () => {
    const page = await mount();

    page.press('Show confirm password');

    expect(page.typePropertyOf('confirmPassword')).toBe('text');
    expect(page.typePropertyOf('password')).toBe('password');
    expect(page.toggle('Hide confirm password')).toBeDefined();
    expect(page.toggle('Show password')).toBeDefined();
  });
});
