import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { AuthProvider } from '@/contexts/AuthProvider';

import { settle } from './queryHookProbe';
import { renderSettled } from './renderInTheDom';

export async function mountAuth() {
  let auth: ReturnType<typeof useAuth> | undefined;
  function Probe() {
    auth = useAuth();
    return null;
  }
  await renderSettled(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
    settle,
  );
  return () => {
    if (!auth) throw new Error('AuthProvider did not render');
    return auth;
  };
}
