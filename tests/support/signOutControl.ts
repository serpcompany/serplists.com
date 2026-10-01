import { act } from 'react';
import { expect } from 'vitest';

import { click, findByText, type FakeElement } from '../fixtures/fakeDom';
import { deferred } from './deferred';
import { navigation } from './nextNavigation';

export const aSignOutTheServerAnswersLater = () => deferred<{ ok: boolean }>();

export async function expectTheControlToLeaveOnlyOnceSignedOut(
  container: FakeElement,
  control: string,
  signingOut: ReturnType<typeof aSignOutTheServerAnswersLater>,
) {
  const before = navigation.log.length;
  await act(async () => {
    click(container, findByText(container, 'BUTTON', control));
  });
  expect(navigation.log.slice(before)).toEqual([]);

  await act(async () => {
    signingOut.resolve({ ok: true });
  });
  expect(navigation.log.slice(before)).toEqual([expect.objectContaining({ kind: 'push', href: '/' })]);
}
