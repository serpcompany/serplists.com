import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
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
      <StaticRouter location="/dashboard/templates/new">
        <DevLoginBar />
      </StaticRouter>,
    );

    expect(html).toBe('');
  });

  it('stays hidden on authenticated dashboard routes used for design QA', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/dashboard">
        <DevLoginBar />
      </StaticRouter>,
    );

    expect(html).toBe('');
  });

  it('still renders on the login route in development', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/login">
        <DevLoginBar />
      </StaticRouter>,
    );

    expect(html).toContain('DEV MODE');
  });
});
