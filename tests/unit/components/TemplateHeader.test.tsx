import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateHeader } from '@/components/template-editor/TemplateHeader';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

describe('TemplateHeader', () => {
  it('renders the compact reference-style editor top bar', () => {
    const html = renderToStaticMarkup(
      <TemplateHeader
        isEditing
        isSaving={false}
        templateSlug="piggyback-discovery-sop"
        title="New Employee Onboarding"
        onCancel={() => undefined}
        onPreview={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(html).toContain('New Employee Onboarding');
    expect(html).toContain('Editing');
    expect(html).toContain('Save');
    expect(html).toContain('Preview');
    expect(html).toContain('sticky top-0 z-50');
    expect(html).not.toContain('Template editor');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('Cancel');
  });
});
