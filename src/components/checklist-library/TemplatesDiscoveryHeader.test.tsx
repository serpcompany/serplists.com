import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TemplatesDiscoveryHeader } from '@/components/checklist-library/TemplatesDiscoveryHeader';

describe('TemplatesDiscoveryHeader', () => {
  it('renders the discovery header actions and search affordance', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/templates']}>
        <TemplatesDiscoveryHeader />
      </MemoryRouter>,
    );

    expect(markup).toContain('Checklist');
    expect(markup).toContain('Search templates...');
    expect(markup).toContain('My Library');
    expect(markup).toContain('Create Template');
  });
});
