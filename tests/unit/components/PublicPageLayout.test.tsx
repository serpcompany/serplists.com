import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  PublicPageBackLink,
  PublicPageContainer,
  PublicPageSplitLayout,
  PublicSidebarSection,
} from '@/components/layout/PublicPageLayout';

describe('PublicPageLayout', () => {
  it('renders a reusable public detail-page frame with a tighter docs-style sidebar rail', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PublicPageContainer>
          <PublicPageBackLink to="/templates">Back to templates</PublicPageBackLink>
          <PublicPageSplitLayout
            asidePosition="end"
            main={<div>Main content</div>}
            aside={
              <PublicSidebarSection title="Template details">
                Sidebar content
              </PublicSidebarSection>
            }
          />
        </PublicPageContainer>
      </MemoryRouter>,
    );

    expect(html).toContain('Back to templates');
    expect(html).toContain('Main content');
    expect(html).toContain('Template details');
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_256px]');
  });
});
