import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { assert, describe, expect, it } from 'vitest';
import { renderSettled } from '../../support/renderInTheDom';

import { PasswordInput } from '@/components/auth/PasswordInput';

const mount = async () => {
  await renderSettled(
    <>
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" />
      <label htmlFor="confirmPassword">Confirm password</label>
      <PasswordInput id="confirmPassword" toggleLabel="confirm password" />
    </>,
  );
  const field = (label: string) => {
    const input = screen.getByLabelText(label, { selector: 'input' });
    assert.instanceOf(input, HTMLInputElement, `the ${label} field`);
    return input;
  };
  const toggle = (name: string) => screen.queryByRole('button', { name }) ?? undefined;
  const press = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }));
  };
  return { field, press, toggle, typePropertyOf: (label: string) => field(label).type };
};

describe('PasswordInput on Log in and Register', () => {
  it('hides the password until its button shows it, and hides it again', async () => {
    const page = await mount();
    expect(page.typePropertyOf('Password')).toBe('password');
    expect(page.toggle('Hide password')).toBeUndefined();

    page.press('Show password');
    expect(page.typePropertyOf('Password')).toBe('text');
    expect(page.toggle('Hide password')).toBeDefined();

    page.press('Hide password');
    expect(page.typePropertyOf('Password')).toBe('password');
  });

  it('names the button after its field and leaves the other field hidden', async () => {
    const page = await mount();

    page.press('Show confirm password');

    expect(page.typePropertyOf('Confirm password')).toBe('text');
    expect(page.typePropertyOf('Password')).toBe('password');
    expect(page.toggle('Hide confirm password')).toBeDefined();
    expect(page.toggle('Show password')).toBeDefined();
  });

  it('puts the cursor in the field when the space around its button is clicked, but not when the button is', async () => {
    const page = await mount();
    const showButton = screen.getByRole('button', { name: 'Show password' });

    fireEvent.click(showButton);
    expect(document.activeElement).not.toBe(page.field('Password'));

    const besideTheButton = showButton.parentElement;
    assert.exists(besideTheButton, 'the space around the Show password button');
    fireEvent.click(besideTheButton);
    expect(document.activeElement).toBe(page.field('Password'));
  });
});
