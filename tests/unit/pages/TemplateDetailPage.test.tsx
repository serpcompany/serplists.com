import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import TemplateDetail from '@/pages/TemplateDetail';
import { buildV0DemoPrivateTemplate } from '@/features/parity/v0DemoFixtures';

const mockUseTemplateDetailModel = vi.fn();

vi.mock('@/features/template-detail/useTemplateDetailModel', () => ({
  useTemplateDetailModel: (...args: unknown[]) =>
    mockUseTemplateDetailModel(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      email: 'john@example.com',
      id: 'user-1',
      username: 'designops',
    },
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    createRun: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
  }),
}));

vi.mock('@/lib/access-flow', () => ({
  navigateToLoginWithReturnPath: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

describe('TemplateDetail page', () => {
  it('renders the v0 private template detail structure with stats, structure, and metadata cards', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      billingState: {
        billingEnabled: false,
        isLoading: false,
        isPro: true,
      },
      loading: false,
      notFound: false,
      saveTemplate: vi.fn(),
      shareTemplate: vi.fn(),
      startRun: vi.fn(),
      template: buildV0DemoPrivateTemplate(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard/templates/tpl-1']}>
        <Routes>
          <Route
            path="/dashboard/templates/:id"
            element={<TemplateDetail />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('Product Launch Checklist');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-dashboard-scroll-area="true"');
    expect(html).toContain('Total Tasks');
    expect(html).toContain('Views');
    expect(html).toContain('Copies');
    expect(html).toContain('Runs');
    expect(html).toContain('Template Structure');
    expect(html).toContain('Details');
    expect(html).toContain('Categories &amp; Tags');
    expect(html).toContain('Start Run');
    expect(html).toContain('Share');
    expect(html).toContain('Edit');
    expect(html).not.toContain('New Template');
    expect(html).not.toContain('Import Template');
    expect(html).not.toContain('PublicTemplateContent');
  });
});
