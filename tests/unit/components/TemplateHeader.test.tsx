import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateHeader } from '@/components/template-editor/TemplateHeader';

import { findUnnamedControls, getByAccessibleName } from './accessibleMarkup';

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

describe('TemplateHeader while a file uploads', () => {
  // Saving now would store the block without the file (and a new template would leave
  // the page, dropping the upload).
  it('disables Save and says a file is uploading', () => {
    const html = renderToStaticMarkup(
      <TemplateHeader
        isEditing
        isSaving={false}
        isUploading
        title="New Employee Onboarding"
        onCancel={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Uploading\.\.\.<\/button>/);
    expect(html).not.toMatch(/>\s*Save\s*<\/button>/);
  });

  it('keeps Save enabled when nothing is uploading', () => {
    const html = renderToStaticMarkup(
      <TemplateHeader
        isEditing
        isSaving={false}
        isUploading={false}
        title="New Employee Onboarding"
        onCancel={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(html).not.toContain('Uploading...');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Save<\/button>/);
  });
});

describe('TemplateHeader accessible names', () => {
  it('names every button, including the icon-only back and more-actions buttons', () => {
    const html = renderToStaticMarkup(
      <TemplateHeader
        isEditing
        isSaving={false}
        title="New Employee Onboarding"
        onCancel={() => undefined}
        onPreview={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(findUnnamedControls(html)).toEqual([]);
    expect(getByAccessibleName(html, 'Back to templates')?.tag).toBe('button');
    expect(getByAccessibleName(html, 'More actions')?.tag).toBe('button');
  });
});
