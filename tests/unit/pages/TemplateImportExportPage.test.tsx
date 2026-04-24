import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TemplateImportExport from '@/pages/TemplateImportExport';

vi.mock('@/components/TemplateBackup', () => ({
  TemplateBackup: () => (
    <section data-template-import-export="true">
      Template JSON Import &amp; Export
    </section>
  ),
}));

describe('TemplateImportExport page', () => {
  it('renders import and export as a dedicated dashboard section', () => {
    const html = renderToStaticMarkup(<TemplateImportExport />);

    expect(html).toContain('Import Templates');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-template-import-export="true"');
    expect(html).toContain('Template JSON Import');
    expect(html).not.toContain('My Templates');
  });
});
