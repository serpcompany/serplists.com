import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { z } from 'zod';
import { createFakeContainer, installFakeDomGlobals, type FakeElement } from '../fixtures/fakeDom';

const propsReactKeepsOnAField = z.object({ onChange: z.function().args(z.unknown()) }).passthrough();

export async function typeThroughTheFieldsOwnOnChange(field: FakeElement, value: string) {
  const [, props] = Object.entries(field).find(([key]) => key.startsWith('__reactProps$')) ?? [];
  const { onChange } = propsReactKeepsOnAField.parse(props);
  await act(async () => onChange({ target: { value }, currentTarget: { value } }));
}

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
  const track = (root: Root): Root => {
    roots.push(root);
    return root;
  };
  return {
    track,
    async render(element: ReactNode, whileRendering: () => Promise<unknown> = async () => undefined) {
      const container = createFakeContainer();
      const root = track(createRoot(container));
      await act(async () => {
        root.render(element);
        await whileRendering();
      });
      return { container, root };
    },
  };
}
