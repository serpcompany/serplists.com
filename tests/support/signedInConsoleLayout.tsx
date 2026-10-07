import { navigation } from './mockedNextNavigation';
import { appShell } from './appShellInPlace';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

vi.mock('@/lib/api', async () => (await import('./emptyArchiveApi')).emptyArchiveApi());

import AppLayout from '@/app/(app)/layout';
import { Providers } from '@/app/providers';

appShell.auth = {
  logout: vi.fn().mockResolvedValue({ ok: true }),
  user: { id: 'user-1', email: 'user@example.com', name: 'User One' },
};

export const renderInTheSignedInLayoutAt = (pathname: string, page: ReactNode): string => {
  navigation.reset(pathname);
  return renderToStaticMarkup(
    <Providers>
      <AppLayout>{page}</AppLayout>
    </Providers>,
  );
};
