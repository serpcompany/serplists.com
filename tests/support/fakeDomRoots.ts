import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { installFakeDomGlobals } from '../fixtures/fakeDom';

export function aFakeDomForEachTest(window?: object) {
  let restoreGlobals: () => void = () => {};
  const roots: Root[] = [];
  beforeAll(() => {
    restoreGlobals = installFakeDomGlobals(window);
  });
  afterAll(() => restoreGlobals());
  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) root.unmount();
    });
  });
  return {
    track(root: Root): Root {
      roots.push(root);
      return root;
    },
  };
}
