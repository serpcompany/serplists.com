import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  PublicPageBackLink,
  PublicPageContainer,
  PublicPageSplitLayout,
  PublicSidebarSection,
} from '@/components/layout/PublicPageLayout';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

describe('PublicPageLayout', () => {
  it('renders a reusable public detail-page frame with a tighter docs-style sidebar rail', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
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
      </PublicPageContainer>,
    );

    expect(html).toContain('Back to templates');
    expect(html).toContain('Main content');
    expect(html).toContain('Template details');
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_256px]');
  });
});
