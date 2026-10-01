import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CardTitle } from '@/components/ui/card';

describe('CardTitle', () => {
  it('is an h3 by default, where shadcn renders a div, so card titles stay in the page outline', () => {
    expect(renderToStaticMarkup(<CardTitle>Details</CardTitle>)).toMatch(
      /^<h3 data-slot="card-title"[^>]*>Details<\/h3>$/,
    );
  });

  it.each(['h1', 'h2', 'h4'] as const)('renders the level it is given (%s), such as h2 for a card right under the h1', (level) => {
    const markup = renderToStaticMarkup(<CardTitle as={level}>Billing</CardTitle>);

    expect(markup).toMatch(new RegExp(`^<${level} data-slot="card-title"[^>]*>Billing</${level}>$`));
  });
});
