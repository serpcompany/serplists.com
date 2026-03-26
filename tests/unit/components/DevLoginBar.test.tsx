import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DevLoginBar } from '@/components/DevLoginBar';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    user: null,
  }),
}));

describe('DevLoginBar', () => {
  it('stays hidden on blank template editor routes', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard/templates/new']}>
        <DevLoginBar />
      </MemoryRouter>,
    );

    expect(html).toBe('');
  });

  it('still renders on normal routes in development', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DevLoginBar />
      </MemoryRouter>,
    );

    expect(html).toContain('DEV MODE');
  });
});
