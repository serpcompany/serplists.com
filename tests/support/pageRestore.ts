import { act } from 'react';
import { expect } from 'vitest';

type CalledMock = { mock: { calls: unknown[] } };

const pageshow = (persisted: boolean) => Object.assign(new Event('pageshow'), { persisted });

export async function expectOneCallOnlyAfterABackForwardRestore(target: EventTarget, called: CalledMock) {
  const before = called.mock.calls.length;
  await act(async () => {
    target.dispatchEvent(pageshow(false));
  });
  const afterOrdinary = called.mock.calls.length;
  await act(async () => {
    target.dispatchEvent(pageshow(true));
  });
  expect({ ordinary: afterOrdinary - before, restored: called.mock.calls.length - afterOrdinary }).toEqual({
    ordinary: 0,
    restored: 1,
  });
}
