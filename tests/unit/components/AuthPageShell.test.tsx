import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthPageShell } from '@/components/auth/AuthPageShell';

describe('AuthPageShell', () => {
  it('keeps auth compact and frames the next steps like a product workflow', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AuthPageShell
          title="Sign in to your account"
          description="Use your workspace credentials"
          footer="Create an account"
        >
          <form>
            <input name="email" />
          </form>
        </AuthPageShell>
      </MemoryRouter>,
    );

    expect(html).not.toContain('min-h-screen flex items-center');
    expect(html).toContain('What happens after sign in');
    expect(html).not.toContain('Why teams switch to SERP Lists');
  });
});
