import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderSettled } from './renderInTheDom';

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function mountQueryHook<T>(useHook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let rendered: { value: T } | undefined;
  function Probe() {
    rendered = { value: useHook() };
    return null;
  }
  const { unmount } = await renderSettled(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return {
    current: () => {
      if (!rendered) throw new Error('The hook did not render');
      return rendered.value;
    },
    unmount: () => {
      unmount();
      queryClient.clear();
    },
  };
}
