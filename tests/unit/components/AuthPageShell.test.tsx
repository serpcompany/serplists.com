import '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { navigation } from '../../support/nextNavigation';

describe('AuthPageShell', () => {
  it('keeps auth compact and frames the next steps like a product workflow', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <AuthPageShell
        title="Sign in to your account"
        description="Use your workspace credentials"
        footer="Create an account"
      >
        <form>
          <input name="email" />
        </form>
      </AuthPageShell>,
    );

    expect(html).not.toContain('min-h-screen flex items-center');
    expect(html).toContain('Built for repeatable work');
    expect(html).toContain('Create the template once. Run it cleanly every time.');
    expect(html).not.toContain('Why teams switch to SERP Lists');
  });
});
