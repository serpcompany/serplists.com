import '../../support/appShellInPlace';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Providers } from '@/app/providers';

describe('toast rendering', () => {
  it('mounts the sonner Toaster in the app providers', () => {
    const markup = renderToStaticMarkup(React.createElement(Providers, null, React.createElement('main', null, 'Page')));

    expect(markup).toContain('<i data-toaster=""></i>');
    expect(markup).toContain('<main>Page</main>');
  });
});
