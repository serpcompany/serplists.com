import React, { type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceProvider';

export type ShownWorkspace = ReturnType<typeof useWorkspace>;

export function renderTheWorkspaceProvider(children: ReactNode = null) {
  const shown: { value?: ShownWorkspace } = {};
  const Probe = () => {
    shown.value = useWorkspace();
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <Probe />
        {children}
      </WorkspaceProvider>
    </QueryClientProvider>
  );
  const rendered = render(tree());
  return {
    rerender: () => rendered.rerender(tree()),
    unmount: rendered.unmount,
    workspace: (): ShownWorkspace => {
      if (!shown.value) throw new Error('WorkspaceProvider did not render');
      return shown.value;
    },
  };
}
