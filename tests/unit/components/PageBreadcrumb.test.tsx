import { navigation } from '../../support/mockedNextNavigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';

beforeEach(() => {
  navigation.reset('/categories/outdoor/');
});

const links = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);

describe("PageBreadcrumb, a detail page's trail", () => {
  it('links Home and every item with an href, and marks the page', () => {
    const markup = renderToStaticMarkup(
      <PageBreadcrumb items={[{ href: '/categories/', label: 'All Categories' }, { label: 'outdoor' }]} />,
    );

    expect(links(markup)).toEqual(['/', '/categories/']);
    expect(markup).toContain('<span class="sr-only">Home</span>');
    expect(markup).toMatch(/aria-current="page"[^>]*>outdoor</);
  });

  it('keeps a link as the last item while the page itself is not known yet', () => {
    const markup = renderToStaticMarkup(<PageBreadcrumb items={[{ href: '/categories/', label: 'All Categories' }]} />);

    expect(links(markup)).toEqual(['/', '/categories/']);
    expect(markup).not.toContain('aria-current="page"');
  });

  it('starts a console trail at its section without Home', () => {
    const markup = renderToStaticMarkup(
      <PageBreadcrumb home={false} items={[{ href: '/dashboard/templates/', label: 'My Templates' }, { label: 'Audit' }]} />,
    );

    expect(links(markup)).toEqual(['/dashboard/templates/']);
    expect(markup).not.toContain('Home');
  });
});
