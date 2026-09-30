import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CardTitle } from '@/components/ui/card';

// shadcn's CardTitle is a div. Ours is a heading, so card titles stay in the page's outline,
// at the level of where the card sits: a card right under the page's h1 is an h2.
describe('CardTitle', () => {
  it('is an h3 by default', () => {
    expect(renderToStaticMarkup(<CardTitle>Details</CardTitle>)).toMatch(
      /^<h3 data-slot="card-title"[^>]*>Details<\/h3>$/,
    );
  });

  it.each(['h1', 'h2', 'h4'] as const)('renders the level it is given (%s)', (level) => {
    const markup = renderToStaticMarkup(<CardTitle as={level}>Billing</CardTitle>);

    expect(markup).toMatch(new RegExp(`^<${level} data-slot="card-title"[^>]*>Billing</${level}>$`));
  });
});
