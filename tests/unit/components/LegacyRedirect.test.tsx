import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Navigate only acts in an effect, which static rendering skips, so record its target.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, replace }: { to: unknown; replace?: boolean }) => (
      <output data-replace={String(Boolean(replace))}>{JSON.stringify(to)}</output>
    ),
  };
});

import { LegacyRedirect } from '@/components/LegacyRedirect';

const redirectFrom = (entry: string, to: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <LegacyRedirect to={to} />
    </MemoryRouter>,
  );

describe('LegacyRedirect', () => {
  it('keeps the query string and hash', () => {
    const html = redirectFrom('/account?billing=success#billing', '/dashboard/settings');

    expect(html).toContain('data-replace="true"');
    expect(html).toContain(
      JSON.stringify({ pathname: '/dashboard/settings', search: '?billing=success', hash: '#billing' })
        .replace(/"/g, '&quot;'),
    );
  });

  it('redirects a bare legacy path to the bare target', () => {
    const html = redirectFrom('/account', '/dashboard/settings');

    expect(html).toContain(JSON.stringify({ pathname: '/dashboard/settings', search: '', hash: '' }).replace(/"/g, '&quot;'));
  });
});
