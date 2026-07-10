import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TemplateEditor from '@/pages/TemplateEditor';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

const mockUseTemplateEditorModel = vi.fn();
const mockUseTemplateEditorState = vi.fn();

vi.mock('@/features/template-editor/useTemplateEditorModel', () => ({
  useTemplateEditorModel: (...args: unknown[]) =>
    mockUseTemplateEditorModel(...args),
}));

vi.mock('@/hooks/useTemplateEditorState', () => ({
  useTemplateEditorState: (...args: unknown[]) =>
    mockUseTemplateEditorState(...args),
}));

describe('TemplateEditor page', () => {
  it('uses the v0-style split editor shell instead of the old wide content canvas', () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({
        title: 'New Employee Onboarding',
        description: 'A comprehensive checklist for onboarding new team members',
        sections: [
          {
            id: 'section-1',
            title: 'Before Day One',
            items: [
              {
                id: 'item-1',
                title: 'Send welcome email',
                contents: [],
              },
            ],
          },
        ],
      }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: 'new-employee-onboarding',
    });

    mockUseTemplateEditorState.mockReturnValue({
      selectedSectionIndex: 0,
      selectedItemIndex: null,
      showingSEO: false,
      showingTemplateInfo: true,
      errors: [],
      setErrors: vi.fn(),
      handleSelectSection: vi.fn(),
      handleSelectItem: vi.fn(),
      handleSelectSEO: vi.fn(),
      handleSelectTemplateInfo: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/dashboard/templates/new">
        <Routes>
          <Route path="/dashboard/templates/new" element={<TemplateEditor />} />
        </Routes>
      </StaticRouter>,
    );

    expect(html).toContain('Template Settings');
    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Sections');
    expect(html).toContain('bg-sidebar');
    expect(html).toContain('max-w-2xl');
    expect(html).not.toContain('text-4xl');
    expect(html).not.toContain('Add a section from the outline to start building this template.');
  });
});
