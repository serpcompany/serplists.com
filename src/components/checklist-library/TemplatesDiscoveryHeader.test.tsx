import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';

import { TemplatesDiscoveryHeader } from '@/components/checklist-library/TemplatesDiscoveryHeader';

describe('TemplatesDiscoveryHeader', () => {
  it('renders the v0 discovery header logo, search slot, and direct action links', () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/templates">
        <TemplatesDiscoveryHeader
          onSearchChange={() => undefined}
          searchQuery="launch"
        />
      </StaticRouter>,
    );

    expect(markup).toContain('SERP Lists');
    expect(markup).toContain('Search templates...');
    expect(markup).toContain('My Library');
    expect(markup).toContain('Create Template');
    expect(markup).toContain('sticky top-0 z-50');
    expect(markup).toContain('max-w-6xl');
    expect(markup).toContain('value="launch"');
    expect(markup).toContain('href="/templates"');
    expect(markup).toContain('href="/dashboard/templates"');
    expect(markup).toContain('href="/dashboard/templates/new"');
  });
});
