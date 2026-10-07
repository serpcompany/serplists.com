import { navigation } from '../../support/mockedNextNavigation';
import '../../support/appShellInPlace';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Providers } from '@/app/providers';

describe('Toaster placement', () => {
  it("mounts the Toaster once, before the page, so a toast from the page's first effect is not dropped", () => {
    navigation.reset('/login?verified=1');
    const html = renderToStaticMarkup(
      <Providers>
        <p>Login page</p>
      </Providers>,
    );

    expect(html.split('data-toaster').length - 1).toBe(1);
    expect(html.indexOf('data-toaster')).toBeLessThan(html.indexOf('Login page'));
  });
});
