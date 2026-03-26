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
  it('renders a stripped template editor header instead of the old pseudo-wizard chrome', () => {
    const html = renderToStaticMarkup(
      <TemplateHeader
        isEditing
        isSaving={false}
        templateSlug="piggyback-discovery-sop"
        onCancel={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(html).toContain('Template editor');
    expect(html).toContain('Editing');
    expect(html).toContain('Templates');
    expect(html).not.toContain('Versions');
  });
});
