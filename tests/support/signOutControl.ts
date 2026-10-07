import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { expect } from 'vitest';

import { deferred } from './deferred';
import { navigation } from './nextNavigation';
import { theButtonOrMenuItemNamed } from './renderInTheDom';

export const aSignOutTheServerAnswersLater = () => deferred<{ ok: boolean }>();

export async function expectTheControlToLeaveOnlyOnceSignedOut(
  control: string,
  signingOut: ReturnType<typeof aSignOutTheServerAnswersLater>,
) {
  const before = navigation.log.length;
  await act(async () => {
    fireEvent.click(theButtonOrMenuItemNamed(control));
  });
  expect(navigation.log.slice(before)).toEqual([]);

  await act(async () => {
    signingOut.resolve({ ok: true });
  });
  expect(navigation.log.slice(before)).toEqual([expect.objectContaining({ kind: 'push', href: '/' })]);
}
