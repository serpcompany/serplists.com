import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '@/contexts/CloudflareAuthContext';

import { aFakeDomForEachTest } from './fakeDomRoots';
import { settle } from './queryHookProbe';

export function anAuthProviderForEachTest(window?: object) {
  const fakeDom = aFakeDomForEachTest(window);
  return async function mountAuth() {
    let auth: ReturnType<typeof useAuth> | undefined;
    function Probe() {
      auth = useAuth();
      return null;
    }
    await fakeDom.render(
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
  };
}
