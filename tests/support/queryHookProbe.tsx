import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createFakeContainer } from '../fixtures/fakeDom';

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function mountQueryHook<T>(useHook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let rendered: { value: T } | undefined;
  function Probe() {
    rendered = { value: useHook() };
    return null;
  }
  const root = createRoot(createFakeContainer() as unknown as Element);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return {
    current: () => {
      if (!rendered) throw new Error('The hook did not render');
      return rendered.value;
    },
    unmount: () => {
      act(() => root.unmount());
      queryClient.clear();
    },
  };
}
